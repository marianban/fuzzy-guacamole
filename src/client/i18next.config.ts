export default {
  locales: ['en', 'sk'],
  extract: {
    input: 'src/**/*.{js,jsx,ts,tsx}',
    output: 'public/locales/{{language}}/{{namespace}}.json'
  },
  types: {
    input: 'public/locales/en/*.json',
    output: 'src/@types/i18next.d.ts',
    resourcesFile: 'src/@types/resources.d.ts',
    enableSelector: true
  }
};
