const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

async function workloadAccessToken(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!response.ok) throw new Error(`Cloud Tasks 인증 토큰을 가져오지 못했습니다. (${response.status})`);
  const body = await response.json();
  if (!body.access_token) throw new Error('Cloud Tasks 인증 토큰이 비어 있습니다.');
  return body.access_token;
}

export function taskQueueConfigured() {
  return Boolean(process.env.CLOUD_TASKS_QUEUE && process.env.CLOUD_TASKS_LOCATION && process.env.KEEP_TASK_TOKEN);
}

export async function enqueueIntake({ intakeId, userId, accessToken, fetchImpl = globalThis.fetch }) {
  const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
  const queue = process.env.CLOUD_TASKS_QUEUE;
  const location = process.env.CLOUD_TASKS_LOCATION;
  const handlerUrl = process.env.CLOUD_TASKS_HANDLER_URL;
  if (!project || !queue || !location || !handlerUrl || !process.env.KEEP_TASK_TOKEN) throw new Error('Cloud Tasks 큐 설정이 필요합니다.');
  const token = await workloadAccessToken(fetchImpl);
  const body = Buffer.from(JSON.stringify({ user_id: userId, access_token: accessToken })).toString('base64');
  const response = await fetchImpl(`https://cloudtasks.googleapis.com/v2/projects/${project}/locations/${location}/queues/${queue}/tasks`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ task: { httpRequest: {
      httpMethod: 'POST', url: `${handlerUrl.replace(/\/$/, '')}/v1/internal/intakes/${encodeURIComponent(intakeId)}`,
      headers: { 'Content-Type': 'application/json', 'X-Keep-Task-Token': process.env.KEEP_TASK_TOKEN }, body,
    } } }),
  });
  if (!response.ok) throw new Error(`Cloud Tasks 작업 등록에 실패했습니다. (${response.status})`);
}
