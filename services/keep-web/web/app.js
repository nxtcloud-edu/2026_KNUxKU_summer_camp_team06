const connection = document.querySelector('#connection');
const account = document.querySelector('#account');
const loginButton = document.querySelector('#login');
const logoutButton = document.querySelector('#logout');
const opportunitiesOutput = document.querySelector('#opportunities');
const params = new URLSearchParams(window.location.search);
const intakeId = params.get('intake_id');

let client = null;
let session = null;

function setAccount(message, loggedIn = false) {
  account.textContent = message;
  loginButton.hidden = loggedIn;
  logoutButton.hidden = !loggedIn;
}

function renderOpportunities(items) {
  opportunitiesOutput.replaceChildren();
  if (!items.length) {
    opportunitiesOutput.textContent = '아직 내 저장 정보가 없습니다.';
    return;
  }
  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'opportunity-card';
    const fields = [
      ['제목', item.title || '정보 없음'],
      ['내용', item.body || item.summary || '본문을 확인할 수 없습니다.'],
      ['기간', item.deadline || '정보 없음']
    ];
    for (const [label, value] of fields) {
      const row = document.createElement('p');
      const labelElement = document.createElement('strong');
      labelElement.textContent = label + ': ';
      row.append(labelElement, value);
      card.append(row);
    }

    const linkRow = document.createElement('p');
    const linkLabel = document.createElement('strong');
    linkLabel.textContent = '링크: ';
    linkRow.append(linkLabel);
    const links = [item.canonical_url || item.source_url, ...(item.links || []).map((link) => link.url)]
      .filter(Boolean)
      .filter((url, index, all) => all.indexOf(url) === index);
    if (!links.length) {
      linkRow.append('정보 없음');
    } else {
      links.forEach((url, index) => {
        if (index > 0) linkRow.append(' · ');
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noreferrer';
        anchor.textContent = url;
        linkRow.append(anchor);
      });
    }
    card.append(linkRow);
    opportunitiesOutput.append(card);
  }
}

async function api(path) {
  if (!session?.access_token) throw new Error('로그인이 필요합니다.');
  const response = await fetch(path, {
    headers: { authorization: 'Bearer ' + session.access_token }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || '요청을 처리하지 못했습니다.');
  return data;
}

async function loadMyOpportunities() {
  if (!session) {
    opportunitiesOutput.textContent = 'Google 로그인 후 내 저장 목록을 확인할 수 있습니다.';
    connection.textContent = '로그인이 필요합니다.';
    return;
  }
  try {
    const me = await api('/v1/me');
    setAccount((me.user.email || '로그인한 사용자') + ' 계정으로 사용 중', true);
    const list = await api('/v1/opportunities');
    renderOpportunities(list.items || []);
    connection.textContent = '내 저장 목록을 불러왔습니다.';
    if (!intakeId) return;
    const intake = await api('/v1/intakes/' + encodeURIComponent(intakeId));
    if (['QUEUED', 'RECEIVED', 'EXTRACTING', 'NORMALIZING', 'VALIDATING'].includes(intake.status)) {
      window.setTimeout(loadMyOpportunities, 500);
    }
  } catch (error) {
    connection.textContent = 'API 연결 실패: ' + error.message;
  }
}

async function completeCallback() {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) return;
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
  window.history.replaceState({}, document.title, '/');
}

async function boot() {
  try {
    const configResponse = await fetch('/v1/auth/config');
    const config = await configResponse.json();
    if (!configResponse.ok) throw new Error(config.error?.message || '인증 설정을 읽지 못했습니다.');
    if (!window.supabase?.createClient) throw new Error('Supabase 로그인 모듈을 불러오지 못했습니다.');
    client = window.supabase.createClient(config.supabase_url, config.supabase_anon_key, {
      auth: { flowType: 'pkce', detectSessionInUrl: false }
    });
    await completeCallback();
    const { data } = await client.auth.getSession();
    session = data.session;
    setAccount(session ? '로그인 정보를 확인하는 중...' : 'Google 로그인 후 내 저장 목록을 확인할 수 있습니다.', Boolean(session));
    await loadMyOpportunities();
    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      loadMyOpportunities();
    });
  } catch (error) {
    setAccount('로그인 설정 오류', false);
    connection.textContent = '인증 초기화 실패: ' + error.message;
  }
}

loginButton.addEventListener('click', async () => {
  if (!client) return;
  loginButton.disabled = true;
  try {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/auth/callback' }
    });
    if (error) throw error;
  } catch (error) {
    connection.textContent = '로그인 시작 실패: ' + error.message;
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  if (!client) return;
  await client.auth.signOut();
  session = null;
  setAccount('로그아웃되었습니다.', false);
  await loadMyOpportunities();
});

boot();
