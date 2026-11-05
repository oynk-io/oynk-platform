/** Optional aggregate reads must not discard a successfully read member position. */
export async function readPoolView<P extends object,S,L>(readPosition:()=>Promise<P>,readStats:()=>Promise<S>,readLiquidity:()=>Promise<L>) {
 const [position,stats,liquidity]=await Promise.all([
  readPosition(),
  readStats().catch(()=>null),
  readLiquidity().catch(()=>null),
 ]);
 return {...position,stats,liquidity};
}
