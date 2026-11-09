(() => {
  if (!window.__TAURI__?.core?.invoke) return;

  const invoke = window.__TAURI__.core.invoke;
  const listen = window.__TAURI__.event.listen;
  const convertFileSrc = window.__TAURI__.core.convertFileSrc;
  // SAF tree URIs are stored as-is; only file:// media becomes asset URLs.
  const isContentUri = value => typeof value === 'string' && value.startsWith('content://');
  const convertPaths = value => {
    if (isContentUri(value)) return value;    if (typeof value === 'string' && value.startsWith('file://')) {
      try { return convertFileSrc(decodeURIComponent(new URL(value).pathname)); } catch { return value; }
    }
    if (Array.isArray(value)) return value.map(convertPaths);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convertPaths(item)]));
    return value;
  };
  const call = (command, args) => invoke(command, args).then(convertPaths);
  const subscribe = (event, fn) => {
    let stop;
    // Events bypass `call()`'s convertPaths, so Rust file:// URLs (with %20
    // segments from paths with spaces - e.g. "Application Support") would
    // never load as images in the webview. Convert them here too.
    listen(event, message => fn(convertPaths(message.payload))).then(unlisten => { stop = unlisten; });
    return () => stop?.();
  };

  const toggleFullscreen = async () => {
    const appWindow = window.__TAURI__.window.getCurrentWindow();
    await appWindow.setFullscreen(!(await appWindow.isFullscreen()));
  };

  window.addEventListener('keydown', event => {
    if (event.key !== 'F11' || event.repeat) return;
    event.preventDefault();
    toggleFullscreen().catch(error => console.error('Failed to toggle fullscreen:', error));
  });

  window.api = {
    ...window.api,
    getConfig: () => call('get_config'),
    setConfig: cfg => call('set_config', { cfg }),
    scan: (withReport = false, options) => call('scan_library', { with_report: withReport, options: options ?? null }),
    cachedLibrary: () => call('cached_library'),
    toggleFavorite: id => call('toggle_favorite', { game_id: id }),
    recordPlay: (id, playTime) => call('record_play', { id, play_time: playTime }),
    updateLibraryPrefs: prefs => call('update_library_prefs', { prefs }),
    getFavorites: () => call('get_favorites'),
    getRecentlyPlayed: limit => call('get_recently_played', { limit }),
    launch: id => call('launch_game', { id }),
    fetchArt: (sys, base, options) => call('fetch_art', { sysId: sys, base, options }),
    artStart: options => call('start_artwork_download', { options }),
    artStatus: () => call('artwork_status'),
    artCancel: () => call('cancel_artwork_download'),
    artOpenFolder: () => call('open_artwork_folder'),
    artImport: options => call('import_artwork', { options }),
    emuList: () => call('list_emulators'),
    emuCheck: id => call('check_emulator_update', { id }),
    emuInstall: id => call('install_emulator', { id }),
    emuUninstall: id => call('uninstall_emulator', { id }),
    emuOpenFolder: id => call('open_emulator_folder', { id }),
    emuPickExe: id => call('pick_emulator_executable', { id }),
    emuAddCustom: opts => call('add_custom_emulator', { opts }),
    pickFolder: title => call('pick_folder', { title }), // Android SAF grant arrives as content URI
    openManual: path => call('open_manual', { path }),
    onProgress: fn => subscribe('emu:progress', fn),
    onArtProgress: fn => subscribe('art:progress', fn),
    onAppUpdateProgress: fn => subscribe('app:updateProgress', fn),
    onToast: fn => subscribe('toast', fn),
    appVersion: () => call('app_version'),
    appCheckUpdate: () => call('check_app_update'),
    appInstallUpdate: () => call('install_app_update'),
    appOpenRelease: url => call('open_release', { url })
  };
})();
