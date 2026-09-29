export function createRumorScheduler(client, options = {}) {
  if (options.enabled !== true || !options.channelId) {
    console.log('[DOMINION RUMORS] Scheduler prepared but DISABLED.');
    return;
  }
  console.log('[DOMINION RUMORS] Enabled for channel ' + options.channelId);
}
