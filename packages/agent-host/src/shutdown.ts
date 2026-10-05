/**
 * How the host's shutdown ends (#396): the steps that stop its services, then the closes that must happen however
 * those went (the store, whose close folds its WAL, and the keeper's child connection).
 *
 * Every close runs: a step that threw does not skip them, and a close that throws does not skip the next one. The
 * first error is the one that comes out, the steps' before any close's, so a close failing on the way out does not
 * hide why the shutdown went wrong; any later one is logged.
 */
export async function stopThenClose(
  stop: () => Promise<void>,
  closes: (() => void)[],
  log: (line: string) => void,
): Promise<void> {
  let failed: { err: unknown } | null = null
  try {
    await stop()
  } catch (err) {
    failed = { err }
  }
  for (const close of closes) {
    try {
      close()
    } catch (err) {
      if (failed) log(`[agent-host] a close on the way out failed too: ${(err as Error).stack ?? String(err)}`)
      else failed = { err }
    }
  }
  if (failed) throw failed.err
}
