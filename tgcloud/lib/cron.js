import { db } from 'sdk'
import { and, eq, isNotNull, isNull, lt, lte } from 'sdk/db'
import { tasks } from '../schema.js'
import { getVNNow } from './time.js'
import { sendReminderViaBotB } from './notifier.js'

export async function runCronCycle() {
  const { dateStr, timeStr } = getVNNow()

  const overdueRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.status, 'pending'), lt(tasks.targetDate, dateStr)))
    .all()

  for (const task of overdueRows) {
    try {
      if (task.lastRolloverDate === dateStr) {
        continue
      }

      await db
        .update(tasks)
        .set({
          targetDate: dateStr,
          isRemindedToday: 0,
          lastRolloverDate: dateStr,
          rolloverCount: (task.rolloverCount || 0) + 1,
        })
        .where(eq(tasks.id, task.id))
        .run()

      await sendReminderViaBotB(
        task.chatId,
        'Hom qua chua lam: ' + task.content + '. Da doi no sang hom nay.',
        task.id,
      )
    } catch (err) {
      console.error(err)
    }
  }

  if (timeStr >= '08:00' && timeStr <= '08:05') {
    const morningRows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'pending'),
          eq(tasks.targetDate, dateStr),
          isNull(tasks.targetTime),
          eq(tasks.isRemindedToday, 0),
        ),
      )
      .all()

    for (const task of morningRows) {
      try {
        const sent = await sendReminderViaBotB(
          task.chatId,
          'Nhac viec trong ngay: ' + task.content,
          task.id,
        )
        if (sent) {
          await db
            .update(tasks)
            .set({ isRemindedToday: 1 })
            .where(eq(tasks.id, task.id))
            .run()
        }
      } catch (err) {
        console.error(err)
      }
    }
  }

  const timedRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.status, 'pending'),
        eq(tasks.targetDate, dateStr),
        isNotNull(tasks.targetTime),
        eq(tasks.isRemindedToday, 0),
        lte(tasks.targetTime, timeStr),
      ),
    )
    .all()

  for (const task of timedRows) {
    try {
      const sent = await sendReminderViaBotB(
        task.chatId,
        'Den gio lam viec (' + task.targetTime + '): ' + task.content,
        task.id,
      )
      if (sent) {
        await db
          .update(tasks)
          .set({ isRemindedToday: 1 })
          .where(eq(tasks.id, task.id))
          .run()
      }
    } catch (err) {
      console.error(err)
    }
  }
}
