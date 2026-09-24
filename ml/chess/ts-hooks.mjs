// Les modules du front importent sans extension (résolu par Next) : sous Node, on essaie .ts.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await next(specifier + ".ts", context);
    } catch {
      /* pas de .ts : résolution normale */
    }
  }
  return next(specifier, context);
}
