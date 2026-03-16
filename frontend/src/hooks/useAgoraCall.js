import AgoraRTC from "agora-rtc-sdk-ng";
import api from "@/api";

let client = null;
let localAudioTrack = null;

export async function startCall(rideId, onRemoteJoin, onRemoteLeave) {
  try {
    // Get token from backend
    const res = await api.get(`/agora/token?channel=ride_${rideId}`);
    const { token, app_id, channel } = res.data;

    // Initialize client
    client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

    // Listen for remote user
    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === "audio") {
        user.audioTrack.play();
        onRemoteJoin?.();
      }
    });
    client.on("user-unpublished", () => onRemoteLeave?.());

    // Join channel
    await client.join(app_id, channel, token, null);

    // Create and publish microphone track
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await client.publish([localAudioTrack]);

    return { success: true };
  } catch (err) {
    console.error("Agora call error:", err);
    return { success: false, error: err.message };
  }
}

export async function endCall() {
  try {
    if (localAudioTrack) {
      localAudioTrack.close();
      localAudioTrack = null;
    }
    if (client) {
      await client.leave();
      client = null;
    }
  } catch (_) {}
}

export function isCalling() {
  return !!client;
}