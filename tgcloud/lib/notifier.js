import { fetch } from 'sdk'
import { BOT_A_USERNAME, BOT_B_TOKEN } from './config.js'

export async function sendReminderViaBotB(chatId, text, taskId = null) {
  if (typeof BOT_B_TOKEN !== 'string' || BOT_B_TOKEN === '') {
    console.error('BOT_B_TOKEN is missing or invalid')
    return false
  }

  const body = {
    chat_id: chatId,
    text,
  }

  if (
    taskId != null &&
    typeof BOT_A_USERNAME === 'string' &&
    BOT_A_USERNAME !== ''
  ) {
    body.reply_markup = {
      inline_keyboard: [
        [
          {
            text: 'Danh dau da xong',
            url: 'https://t.me/' + BOT_A_USERNAME + '?start=done_' + taskId,
          },
        ],
      ],
    }
  }

  try {
    const res = await fetch(
      'https://api.telegram.org/bot' + BOT_B_TOKEN + '/sendMessage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) {
      const responseText = await res.text()
      const truncated =
        responseText.length > 500
          ? responseText.slice(0, 500)
          : responseText
      console.error('sendMessage failed:', res.status, truncated)
      return false
    }

    return true
  } catch (err) {
    console.error('sendMessage request error:', err)
    return false
  }
}
