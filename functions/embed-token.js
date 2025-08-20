const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)); // fallback nếu runtime cũ

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

  const TENANT_ID     = process.env.TENANT_ID;
  const CLIENT_ID     = process.env.CLIENT_ID;
  const CLIENT_SECRET = process.env.CLIENT_SECRET;
  const GROUP_ID      = process.env.GROUP_ID;
  const REPORT_ID     = process.env.REPORT_ID;
  const DATASET_ID    = process.env.DATASET_ID;

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

    // 2) Generate Embed Token
    const genRes = await fetch('https://api.powerbi.com/v1.0/myorg/GenerateToken', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenJson.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reports: [{ id: REPORT_ID }],
        datasets: [{ id: DATASET_ID }],
        targetWorkspaces: [{ id: GROUP_ID }],
        accessLevel: 'View'
      })
    });
    const genJson = await genRes.json();
    if (!genRes.ok || !genJson.token) {
      throw new Error('GenerateToken error: ' + JSON.stringify(genJson));
    }

    const embedUrl = `https://app.powerbi.com/reportEmbed?reportId=${REPORT_ID}&groupId=${GROUP_ID}`;

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        embedUrl,
        reportId: REPORT_ID,
        token: genJson.token,
        expiration: genJson.expiration
      })
    };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: e.message }) };
  }
};
