function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  // --- ENV defaults ---
  const TENANT_ID     = process.env.TENANT_ID;
  const CLIENT_ID     = process.env.CLIENT_ID;
  const CLIENT_SECRET = process.env.CLIENT_SECRET;
  const GROUP_ID_ENV  = process.env.GROUP_ID;
  const REPORT_ID_ENV = process.env.REPORT_ID;
  const DATASET_ID_ENV= process.env.DATASET_ID;

  // --- Query overrides (optional) ---
  const qs = event.queryStringParameters || {};
  const mode      = (qs.mode || '').toLowerCase();              // 'edit' → Edit, else View
  const groupId   = qs.groupId   || GROUP_ID_ENV;
  const reportId  = qs.reportId  || REPORT_ID_ENV;
  const datasetId = qs.datasetId || DATASET_ID_ENV;

  // access level theo mode
  const accessLevel = (mode === 'edit') ? 'Edit' : 'View';

  try {
    // 1) Lấy Azure AD access token
    const tokenRes = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: 'https://analysis.windows.net/powerbi/api/.default',
        grant_type: 'client_credentials'
      })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error('AAD token error: ' + JSON.stringify(tokenJson));
    }

    // 2) Generate Embed Token (View/Edit theo mode) + cho phép override ID
    const genRes = await fetch('https://api.powerbi.com/v1.0/myorg/GenerateToken', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenJson.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reports: [{ id: reportId }],
        datasets: [{ id: datasetId }],
        targetWorkspaces: [{ id: groupId }],
        accessLevel: accessLevel
      })
    });
    const genJson = await genRes.json();
    if (!genRes.ok || !genJson.token) {
      throw new Error('GenerateToken error: ' + JSON.stringify(genJson));
    }

    const embedUrl = `https://app.powerbi.com/reportEmbed?reportId=${reportId}&groupId=${groupId}`;

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        mode: accessLevel,                 // 'View' | 'Edit' (để bạn debug)
        embedUrl,
        reportId,
        datasetId,
        groupId,
        token: genJson.token,
        expiration: genJson.expiration
      })
    };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }
};
