export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/likes/')) {
      const postId = url.pathname.slice('/api/likes/'.length);
      if (!postId) return new Response('Bad Request', { status: 400 });

      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      };

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            ...cors,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      }

      if (request.method === 'GET') {
        const count = parseInt((await env.LIKES.get('likes:' + postId)) || '0', 10);
        return new Response(JSON.stringify({ count }), { headers: cors });
      }

      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const delta = body.action === 'unlike' ? -1 : 1;
        const current = parseInt((await env.LIKES.get('likes:' + postId)) || '0', 10);
        const next = Math.max(0, current + delta);
        await env.LIKES.put('likes:' + postId, String(next));
        return new Response(JSON.stringify({ count: next }), { headers: cors });
      }

      return new Response('Method Not Allowed', { status: 405 });
    }

    return env.ASSETS.fetch(request);
  },
};
