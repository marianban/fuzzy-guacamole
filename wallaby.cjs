module.exports = () => ({
  autoDetect: true,
  tests: {
    override: (testPatterns) => [
      ...testPatterns,
      { pattern: '**/*.int.test.{js,jsx,ts,tsx}', ignore: true }
    ]
  }
});
