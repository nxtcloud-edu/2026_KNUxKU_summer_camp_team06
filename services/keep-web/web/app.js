const connection = document.querySelector('#connection');
const opportunitiesOutput = document.querySelector('#opportunities');
const params = new URLSearchParams(window.location.search);
const intakeId = params.get('intake_id');

function renderOpportunities(items) {
  opportunitiesOutput.replaceChildren();
  if (!items.length) {
    opportunitiesOutput.textContent = '아직 저장된 Opportunity가 없습니다.';
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
      labelElement.textContent = `${label}: `;
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

async function load() {
  try {
    const listResponse = await fetch('/v1/opportunities');
    const list = await listResponse.json();
    renderOpportunities(list.items || []);
    connection.textContent = `API 연결됨 · ${new Date().toLocaleTimeString()}`;
    if (!intakeId) return;
    const intakeResponse = await fetch(`/v1/intakes/${encodeURIComponent(intakeId)}`);
    const intake = await intakeResponse.json();
    if (['QUEUED', 'RECEIVED', 'EXTRACTING', 'NORMALIZING', 'VALIDATING'].includes(intake.status)) {
      window.setTimeout(load, 500);
    }
  } catch (error) {
    connection.textContent = `API 연결 실패: ${error.message}`;
  }
}

load();
