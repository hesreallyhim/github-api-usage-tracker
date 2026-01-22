const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.js']
    }
  }
});
