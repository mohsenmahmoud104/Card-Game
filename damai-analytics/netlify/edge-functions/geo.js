// يعيد رمز دولة الزائر من ترويسة Netlify الجغرافية. لا يقرأ IP ولا يخزّن شيئًا.
export default async (request, context) => {
  const code = (context.geo && context.geo.country && context.geo.country.code) || '';
  return new Response(JSON.stringify({ country: code }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
};
export const config = { path: '/api/geo' };
