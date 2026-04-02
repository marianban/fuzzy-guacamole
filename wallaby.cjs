module.exports = () => ({
  autoDetect: true,
  tests: {
    override: (testPatterns) => [
      ...testPatterns,
      { pattern: '**/*.e2e.test.{js,jsx,ts,tsx}', ignore: true }
    ]
  }
});
