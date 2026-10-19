// Preserve each actual Playwright test ID. The built-in JSON reporter merges
// specs across projects and retains only the first project's ID on that spec.
const fs = require('node:fs');
class BrowserCoverageReporter {
  onBegin(config, suite) {
    this.tests = suite.allTests();
    this.errors = [];
    this.started = Date.now();
    if (config.workers !== 1 || config.fullyParallel)
      throw new Error('CI browser coverage requires workers: 1 and fullyParallel: false');
  }
  onError(error) {
    this.errors.push(error.message || String(error));
  }
  onEnd(result) {
    const tests = (this.tests || []).map((test) => ({
      id: test.id,
      project: test.parent.project().name,
      title: test.titlePath().slice(1).join(' › '),
      ok: test.ok(),
      status: test.outcome(),
      expectedStatus: test.expectedStatus,
      results: test.results.map((entry) => ({
        status: entry.status,
        retry: entry.retry,
        duration: entry.duration,
        errors: entry.errors.map((error) => error.message || String(error)),
      })),
    }));
    fs.writeFileSync(
      process.env.MARKBRIDGE_BROWSER_REPORT,
      JSON.stringify({
        schema: 1,
        source_sha: process.env.SOURCE_SHA,
        status: result.status,
        errors: this.errors || ['Reporter did not begin'],
        tests,
        stats: {
          expected: tests.filter((test) => test.status === 'expected').length,
          unexpected: tests.filter((test) => test.status === 'unexpected').length,
          flaky: tests.filter((test) => test.status === 'flaky').length,
          skipped: tests.filter((test) => test.status === 'skipped').length,
          duration: Date.now() - this.started,
        },
      }),
    );
  }
}
module.exports = BrowserCoverageReporter;
