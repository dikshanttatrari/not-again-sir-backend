const { Expo } = require("expo-server-sdk");
const expo = new Expo();

const sendPushNotification = async (pushTokens, title, body, data = {}) => {
  let messages = [];

  const validTokens = pushTokens.filter((t) => Expo.isExpoPushToken(t));

  for (let token of validTokens) {
    messages.push({
      to: token,
      title: title,
      body: body,
      data: data,
      color: "#6366f1",
      sound: "notification.wav",
      channelId: "custom-alert",
    });
  }

  let chunks = expo.chunkPushNotifications(messages);

  for (let chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.error(error);
    }
  }
};

module.exports = sendPushNotification;
