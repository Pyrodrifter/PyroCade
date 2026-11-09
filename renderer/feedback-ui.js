const FeedbackUI = (() => {
  const find = id => document.getElementById(id);
  const dialog = find('feedbackDialog'), form = find('feedbackForm'), trigger = find('btnFeedback');
  const status = find('feedbackStatus'), device = find('feedbackDevice');
  let busy = false, loaded = false, diagnosticsText = '';

  function service() {
    return Feedback.createFeedbackService({
      diagnostics: () => diagnosticsText,
      openExternal: url => window.api.feedbackOpen(url),
      writeText: text => window.api.feedbackCopy(text),
    });
  }

  function updateType() {
    const bug = find('feedbackKind').value === 'bug';
    find('feedbackStepsGroup').hidden = !bug;
    find('feedbackDescriptionLabel').textContent = bug
      ? 'What happened, and what did you expect? (required)'
      : 'Your feedback or suggestion (required)';
    status.textContent = '';
  }
  function payload() {
    return {
      kind: find('feedbackKind').value,
      summary: find('feedbackSummary').value,
      description: find('feedbackDescription').value,
      steps: find('feedbackSteps').value,
      includeDiagnostics: loaded && find('feedbackDiagnostics').checked,
    };
  }
  async function perform(action) {
    if (busy || !form.reportValidity()) return;
    if (!find('feedbackSummary').value.trim() || !find('feedbackDescription').value.trim()) {
      status.textContent = 'Add a summary and description.';
      return;
    }
    busy = true;
    find('feedbackCopy').disabled = find('feedbackOpen').disabled = true;
    status.textContent = action === 'copy' ? 'Copying report…' : 'Opening GitHub…';
    try {
      if (action === 'copy') await service().copy(payload());
      else await service().open(payload());
      status.textContent = action === 'copy'
        ? 'Report copied. Paste it into a GitHub issue or a message to the maintainer.'
        : 'GitHub opened in your browser. Review your report there and submit it when ready.';
    } catch (error) {
      status.textContent = error.message || 'Could not prepare the report. Please try again.';
    } finally {
      busy = false;
      find('feedbackCopy').disabled = find('feedbackOpen').disabled = false;
    }
  }
  function close() {
    dialog.close();
    trigger.focus();
  }
  trigger.addEventListener('click', async () => {
    if (dialog.open) return;
    status.textContent = '';
    dialog.showModal();
    find('feedbackSummary').focus();
    if (loaded) return;
    try {
      diagnosticsText = await window.api.feedbackInfo();
      device.textContent = diagnosticsText;
      loaded = true;
      find('feedbackDiagnostics').disabled = false;
    } catch {
      device.textContent = 'Device details are unavailable. You can still send your report.';
      find('feedbackDiagnostics').checked = false;
      find('feedbackDiagnostics').disabled = true;
    }
  });
  find('feedbackClose').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  find('feedbackKind').addEventListener('change', updateType);
  find('feedbackDiagnostics').addEventListener('change', event => { device.hidden = !event.target.checked; });
  find('feedbackCopy').addEventListener('click', () => perform('copy'));
  find('feedbackBrowse').addEventListener('click', async () => {
    try { await window.api.appOpenRelease('https://github.com/Pyrodrifter/PyroCade/issues'); }
    catch { status.textContent = 'Could not open GitHub. Your draft is still here; try again or use Copy report.'; }
  });
  form.addEventListener('submit', event => { event.preventDefault(); perform('open'); });
  return {
    isOpen: () => dialog.open,
    controller(action) {
      if (action === 'back') close();
      else if (action === 'play' && document.activeElement?.matches('button')) document.activeElement.click();
      else if (['up', 'down'].includes(action)) {
        const controls = [...form.querySelectorAll('input,select,textarea,button')].filter(e => !e.disabled && e.getClientRects().length);
        const index = controls.indexOf(document.activeElement);
        controls[(index + (action === 'up' ? -1 : 1) + controls.length) % controls.length]?.focus();
      }
    },
  };
})();
