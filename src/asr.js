const tencentcloud = require('tencentcloud-sdk-nodejs');

const AsrClient = tencentcloud.asr.v20190614.Client;

function getAsrConfig() {
  const secretId = process.env.TENCENT_SECRET_ID || process.env.TENCENTCLOUD_SECRET_ID || '';
  const secretKey = process.env.TENCENT_SECRET_KEY || process.env.TENCENTCLOUD_SECRET_KEY || '';
  const region = process.env.TENCENTCLOUD_REGION || 'ap-guangzhou';
  const engineModelType = process.env.ASR_ENGINE_MODEL_TYPE || '16k_zh';
  const voiceFormat = String(process.env.ASR_VOICE_FORMAT || 'mp3').toLowerCase();

  return {
    secretId,
    secretKey,
    region,
    engineModelType,
    voiceFormat
  };
}

function createAsrClient(config) {
  if (!config.secretId || !config.secretKey) {
    const error = new Error('语音识别未配置密钥');
    error.status = 500;
    throw error;
  }

  return new AsrClient({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey
    },
    region: config.region,
    profile: {
      httpProfile: {
        endpoint: 'asr.tencentcloudapi.com'
      }
    }
  });
}

async function recognizeSentence({ audioBase64, audioByteLength, voiceFormat }) {
  const config = getAsrConfig();
  const client = createAsrClient(config);
  const format = String(voiceFormat || config.voiceFormat || 'mp3').toLowerCase();

  const response = await client.SentenceRecognition({
    ProjectId: 0,
    SubServiceType: 2,
    EngSerViceType: config.engineModelType,
    SourceType: 1,
    VoiceFormat: format,
    UsrAudioKey: `coffee-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    Data: audioBase64,
    DataLen: Number(audioByteLength || 0)
  });

  return {
    text: String(response.Result || '').trim(),
    raw: response
  };
}

module.exports = {
  recognizeSentence
};
