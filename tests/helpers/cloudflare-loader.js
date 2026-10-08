// Node tests exercise the real room handlers with an in-memory storage adapter.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return {
    url: 'data:text/javascript,export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }',
    shortCircuit: true
  };
  return nextResolve(specifier, context);
}
