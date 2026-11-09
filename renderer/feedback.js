// Reports contain only the user's text and an explicit list of basic device details.
// Keep this independent of the host so copying and opening use exactly the same report.
const ISSUE_URL = 'https://github.com/Pyrodrifter/PyroCade/issues/new';

function createReport(input, diagnostics) {
  if (!input || !['bug', 'feedback'].includes(input.kind)) throw new Error('Choose a report type.');
  const field = (key, limit, required) => {
    if (typeof input[key] !== 'string') {
      if (required) throw new Error('Add a summary and description.');
      return '';
    }
    const value = input[key].trim();
    if (required && !value) throw new Error('Add a summary and description.');
    if (value.length > limit) throw new Error(`The ${key} is too long (maximum ${limit} characters).`);
    return value;
  };
  const summary = field('summary', 120, true).replace(/[\r\n]+/g, ' ');
  const description = field('description', 4000, true);
  const steps = input.kind === 'bug' ? field('steps', 2000, false) : '';
  const sections = [`## ${input.kind === 'bug' ? 'Problem' : 'Feedback'}\n${description}`];
  if (steps) sections.push(`## Steps to reproduce\n${steps}`);
  if (input.includeDiagnostics === true) sections.push(`## App and device\n${diagnostics}`);
  return { title: `[${input.kind === 'bug' ? 'Bug' : 'Feedback'}] ${summary}`, body: sections.join('\n\n') };
}

function createFeedbackService({ diagnostics, openExternal, writeText, maxUrlLength }) {
  const limit = maxUrlLength ?? platformUrlLengthLimit();
  const report = input => createReport(input, input?.includeDiagnostics === true ? diagnostics() : '');
  return {
    info: () => diagnostics(),
    copy: input => {
      const { title, body } = report(input);
      writeText(`${title}\n\n${body}`);
    },
    open: async input => {
      const { title, body } = report(input);
      const url = new URL(ISSUE_URL);
      url.searchParams.set('template', input.kind === 'bug' ? 'bug_report.md' : 'feedback.md');
      url.searchParams.set('title', title);
      url.searchParams.set('body', body);
      // Very long, especially non-ASCII, reports can exceed OS/browser URL limits.
      // Keep every word available through Copy report instead of silently truncating.
      if (url.href.length > limit) throw new Error('This report is too long for a browser link. Use Copy report, then Browse reports to create an issue and paste it.');
      await openExternal(url.href);
    },
  };
}

function platformUrlLengthLimit() {
  if (typeof process !== 'undefined' && process.platform) return process.platform === 'win32' ? 2081 : 7500;
  const platform = (typeof navigator !== 'undefined' && (navigator.userAgentData?.platform || navigator.platform)) || '';
  return /win/i.test(platform) ? 2081 : 7500;
}

const api = { createReport, createFeedbackService, ISSUE_URL };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.Feedback = api;
