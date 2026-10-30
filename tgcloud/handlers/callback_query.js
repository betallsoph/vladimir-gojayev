import { db, api } from 'sdk'
import { eq } from 'sdk/db'
import { tasks, userStates } from '../schema.js'
import { formatDateForDisplay, getVNNow, getVNTomorrow } from '../lib/time.js'

const EXPIRED_TEXT = 'Thao tac nay da het han hoac da duoc xu ly.'
const EMPTY_KEYBOARD = { inline_keyboard: [] }

async function upsertUserState(chatId, step, activeTaskId) {
  const updatedAt = Date.now()
  await db
    .insert(userStates)
    .values({ chatId, step, activeTaskId, updatedAt })
    .onConflictDoUpdate({
      target: userStates.chatId,
      set: { step, activeTaskId, updatedAt },
    })
    .run()
}

async function editMessage(chatId, messageId, text, reply_markup) {
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup,
    })
  } catch (err) {
    console.error(err)
  }
}

export default async function (callbackQuery, ctx) {
  try {
    await api.answerCallbackQuery({
      callback_query_id: callbackQuery.id,
    })
  } catch {
    // swallow
  }

  if (!callbackQuery.data || !callbackQuery.message) {
    return
  }

  const [domain, action, rawTaskId] = callbackQuery.data.split(':')
  const taskId = Number(rawTaskId)
  if (!Number.isInteger(taskId) || taskId < 1) {
    return
  }

  const chatId = callbackQuery.message.chat.id
  const messageId = callbackQuery.message.message_id

  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get()
  if (!task || task.chatId !== chatId || task.status !== 'draft') {
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: EXPIRED_TEXT,
        reply_markup: EMPTY_KEYBOARD,
      })
    } catch {
      return
    }
    return
  }

  if (domain === 'date') {
    if (action === 'today' || action === 'tomorrow') {
      const targetDate =
        action === 'today' ? getVNNow().dateStr : getVNTomorrow()
      await db
        .update(tasks)
        .set({ targetDate })
        .where(eq(tasks.id, task.id))
        .run()
      await upsertUserState(chatId, 'idle', task.id)
      await editMessage(
        chatId,
        messageId,
        'Cong viec: ' +
          task.content +
          '\nNgay: ' +
          formatDateForDisplay(targetDate) +
          '\nChon gio thuc hien:',
        {
          inline_keyboard: [
            [
              {
                text: 'Khong xac dinh gio',
                callback_data: 'time:none:' + task.id,
              },
              {
                text: 'Gio cu the',
                callback_data: 'time:custom:' + task.id,
              },
            ],
          ],
        },
      )
      return
    }
    if (action === 'custom') {
      await upsertUserState(chatId, 'waiting_date_input', task.id)
      await editMessage(
        chatId,
        messageId,
        'Cong viec: ' +
          task.content +
          '\nNhap ngay cu the theo dinh dang DD/MM/YYYY (Vi du: 31/10/2026):',
        EMPTY_KEYBOARD,
      )
      return
    }
    return
  }

  if (domain === 'time') {
    if (task.targetDate == null || task.targetDate === '') {
      await editMessage(chatId, messageId, EXPIRED_TEXT, EMPTY_KEYBOARD)
      return
    }
    if (action === 'none') {
      await db
        .update(tasks)
        .set({
          targetTime: null,
          status: 'pending',
          isRemindedToday: 0,
        })
        .where(eq(tasks.id, task.id))
        .run()
      await upsertUserState(chatId, 'idle', null)
      await editMessage(
        chatId,
        messageId,
        'Da luu cong viec: ' +
          task.content +
          '\nNgay: ' +
          formatDateForDisplay(task.targetDate) +
          '\nGio: Khong xac dinh',
        EMPTY_KEYBOARD,
      )
      return
    }
    if (action === 'custom') {
      await upsertUserState(chatId, 'waiting_time_input', task.id)
      await editMessage(
        chatId,
        messageId,
        'Cong viec: ' +
          task.content +
          '\nNgay: ' +
          formatDateForDisplay(task.targetDate) +
          '\nNhap gio cu the theo dinh dang HH:mm (Vi du: 14:30):',
        EMPTY_KEYBOARD,
      )
      return
    }
    return
  }

  return
}
