import { db, api } from 'sdk'
import { and, asc, eq } from 'sdk/db'
import { tasks, userStates } from '../schema.js'
import { CRON_SECRET } from '../lib/config.js'
import {
  formatDateForDisplay,
  parseAndValidateDate,
  parseAndValidateTime,
} from '../lib/time.js'
import { runCronCycle } from '../lib/cron.js'

async function upsertState(chatId, fields) {
  const updatedAt = Date.now()
  const set = { updatedAt }
  if (fields.step !== undefined) {
    set.step = fields.step
  }
  if ('activeTaskId' in fields) {
    set.activeTaskId = fields.activeTaskId
  }

  const insertValues = {
    chatId,
    step: fields.step ?? 'idle',
    activeTaskId: 'activeTaskId' in fields ? fields.activeTaskId : null,
    updatedAt,
  }

  await db
    .insert(userStates)
    .values(insertValues)
    .onConflictDoUpdate({
      target: userStates.chatId,
      set,
    })
}

function parseCommandToken(text) {
  const parts = text.split(/\s+/)
  let first = parts[0]
  const atIdx = first.indexOf('@')
  if (atIdx !== -1) {
    first = first.slice(0, atIdx)
  }
  return { command: first.toLowerCase(), parts }
}

async function loadState(chatId) {
  return db.select().from(userStates).where(eq(userStates.chatId, chatId)).get()
}

async function cancelDraftTasksForChat(chatId) {
  await db
    .update(tasks)
    .set({ status: 'cancelled' })
    .where(and(eq(tasks.chatId, chatId), eq(tasks.status, 'draft')))
    .run()
}

export default async function (message, ctx) {
  if (!message || typeof message.text !== 'string') {
    return
  }

  const text = message.text.trim()

  if (
    typeof CRON_SECRET === 'string' &&
    CRON_SECRET.length > 0 &&
    text === '__CRON_TICK__' + CRON_SECRET
  ) {
    try {
      await runCronCycle()
    } catch (err) {
      console.error(err)
    }
    return
  }

  if (message.from && message.from.is_bot) {
    return
  }

  if (!message.chat) {
    return
  }

  const chatId = message.chat.id

  try {
    const { command, parts } = parseCommandToken(text)

    if (command === '/start') {
      const payload = parts[1]
      if (payload && payload.startsWith('done_')) {
        const id = parseInt(payload.slice('done_'.length), 10)
        if (Number.isInteger(id)) {
          const task = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.id, id), eq(tasks.chatId, chatId)))
            .get()

          if (task) {
            await db
              .update(tasks)
              .set({ status: 'completed' })
              .where(eq(tasks.id, task.id))
              .run()
            await upsertState(chatId, { step: 'idle', activeTaskId: null })
            await api.sendMessage({
              chat_id: chatId,
              text: 'Da danh dau hoan thanh cong viec: ' + task.content,
            })
            return
          }
        }
        await upsertState(chatId, { step: 'idle', activeTaskId: null })
        await api.sendMessage({
          chat_id: chatId,
          text: 'Khong tim thay cong viec.',
        })
        return
      }

      await upsertState(chatId, { step: 'idle', activeTaskId: null })
      await api.sendMessage({
        chat_id: chatId,
        text:
          'He thong nhac viec da san sang. Nhan noi dung cong viec bat ky de bat dau. Go /list de xem danh sach viec can lam.',
      })
      return
    }

    if (command === '/cancel') {
      const state = await loadState(chatId)
      if (state && state.activeTaskId != null) {
        const task = await db
          .select()
          .from(tasks)
          .where(eq(tasks.id, state.activeTaskId))
          .get()
        if (
          task &&
          task.chatId === chatId &&
          task.status === 'draft'
        ) {
          await db
            .update(tasks)
            .set({ status: 'cancelled' })
            .where(eq(tasks.id, task.id))
            .run()
        }
      }
      await upsertState(chatId, { step: 'idle', activeTaskId: null })
      await api.sendMessage({
        chat_id: chatId,
        text: 'Da huy thao tac hien tai.',
      })
      return
    }

    if (command === '/list') {
      await upsertState(chatId, { step: 'idle' })

      const pending = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.chatId, chatId), eq(tasks.status, 'pending')))
        .orderBy(asc(tasks.targetDate), asc(tasks.targetTime))
        .all()

      if (pending.length === 0) {
        await api.sendMessage({
          chat_id: chatId,
          text: 'Hien tai ban khong co cong viec nao dang cho.',
        })
        return
      }

      const lines = pending.map((task) => {
        return (
          '[ID: ' +
          task.id +
          '] ' +
          task.content +
          ' | Ngay: ' +
          formatDateForDisplay(task.targetDate) +
          ' | Gio: ' +
          (task.targetTime || 'Khong xac dinh')
        )
      })
      lines.push(
        'De danh dau hoan thanh, nhan /done_<ID> (Vi du: /done_1)',
      )
      await api.sendMessage({
        chat_id: chatId,
        text: lines.join('\n'),
      })
      return
    }

    const doneMatch = text.match(/^\/done_(\d+)$/)
    if (doneMatch) {
      const id = parseInt(doneMatch[1], 10)
      const task = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.id, id),
            eq(tasks.chatId, chatId),
            eq(tasks.status, 'pending'),
          ),
        )
        .get()

      if (task) {
        await db
          .update(tasks)
          .set({ status: 'completed' })
          .where(eq(tasks.id, task.id))
          .run()
        await upsertState(chatId, { step: 'idle', activeTaskId: null })
        await api.sendMessage({
          chat_id: chatId,
          text: 'Da hoan thanh: ' + task.content,
        })
        return
      }

      await upsertState(chatId, { step: 'idle', activeTaskId: null })
      await api.sendMessage({
        chat_id: chatId,
        text: 'Khong tim thay cong viec.',
      })
      return
    }

    const state = await loadState(chatId)
    const step = state?.step ?? 'idle'

    if (step === 'waiting_date_input') {
      const normalizedDate = parseAndValidateDate(text)
      if (normalizedDate == null) {
        await api.sendMessage({
          chat_id: chatId,
          text:
            'Ngay khong hop le hoac da qua. Vui long nhap lai theo dinh dang DD/MM/YYYY (Vi du: 25/12/2026) hoac go /cancel de huy:',
        })
        return
      }

      const activeTaskId = state?.activeTaskId
      const task = activeTaskId
        ? await db
            .select()
            .from(tasks)
            .where(
              and(
                eq(tasks.id, activeTaskId),
                eq(tasks.chatId, chatId),
                eq(tasks.status, 'draft'),
              ),
            )
            .get()
        : null

      if (!task) {
        await upsertState(chatId, { step: 'idle', activeTaskId: null })
        await api.sendMessage({
          chat_id: chatId,
          text: 'Khong tim thay cong viec.',
        })
        return
      }

      await db
        .update(tasks)
        .set({ targetDate: normalizedDate })
        .where(eq(tasks.id, task.id))
        .run()

      await upsertState(chatId, { step: 'idle', activeTaskId: task.id })

      const taskId = task.id
      await api.sendMessage({
        chat_id: chatId,
        text:
          'Da chon ngay ' +
          formatDateForDisplay(normalizedDate) +
          '. Chon gio thuc hien:',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Khong xac dinh gio',
                callback_data: 'time:none:' + taskId,
              },
              {
                text: 'Gio cu the',
                callback_data: 'time:custom:' + taskId,
              },
            ],
          ],
        },
      })
      return
    }

    if (step === 'waiting_time_input') {
      const normalizedTime = parseAndValidateTime(text)
      if (normalizedTime == null) {
        await api.sendMessage({
          chat_id: chatId,
          text:
            'Gio khong hop le. Vui long nhap theo dinh dang 24h HH:mm (Vi du: 08:30 hoac 17:05) hoac go /cancel de huy:',
        })
        return
      }

      const activeTaskId = state?.activeTaskId
      const task = activeTaskId
        ? await db
            .select()
            .from(tasks)
            .where(
              and(
                eq(tasks.id, activeTaskId),
                eq(tasks.chatId, chatId),
                eq(tasks.status, 'draft'),
              ),
            )
            .get()
        : null

      if (!task || !task.targetDate) {
        await upsertState(chatId, { step: 'idle', activeTaskId: null })
        await api.sendMessage({
          chat_id: chatId,
          text: 'Khong tim thay cong viec.',
        })
        return
      }

      await db
        .update(tasks)
        .set({
          targetTime: normalizedTime,
          status: 'pending',
          isRemindedToday: 0,
        })
        .where(eq(tasks.id, task.id))
        .run()

      await upsertState(chatId, { step: 'idle', activeTaskId: null })

      await api.sendMessage({
        chat_id: chatId,
        text:
          'Da luu cong viec: ' +
          task.content +
          '\nNgay: ' +
          formatDateForDisplay(task.targetDate) +
          '\nGio: ' +
          normalizedTime,
      })
      return
    }

    await cancelDraftTasksForChat(chatId)

    const inserted = await db
      .insert(tasks)
      .values({
        chatId,
        content: text,
        status: 'draft',
        createdAt: Date.now(),
        isRemindedToday: 0,
        rolloverCount: 0,
      })
      .returning()

    const newTask = inserted[0]
    const id = newTask.id

    await upsertState(chatId, { step: 'idle', activeTaskId: id })

    await api.sendMessage({
      chat_id: chatId,
      text: 'Cong viec: ' + text + '\nChon ngay thuc hien:',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Hom nay', callback_data: 'date:today:' + id },
            { text: 'Ngay mai', callback_data: 'date:tomorrow:' + id },
          ],
          [{ text: 'Ngay cu the', callback_data: 'date:custom:' + id }],
        ],
      },
    })
  } catch (err) {
    console.error(err)
    await api.sendMessage({
      chat_id: chatId,
      text: 'Da xay ra loi. Vui long thu lai.',
    })
  }
}
