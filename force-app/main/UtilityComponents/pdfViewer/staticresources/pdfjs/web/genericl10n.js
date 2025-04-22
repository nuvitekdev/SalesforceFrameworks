class GenericL10n {
  constructor(lang) {
    console.warn("GenericL10n initialized without Fluent. Localization disabled.");
  }

  async getLanguage() {
    return "en-US";
  }

  async getDirection() {
    return "ltr";
  }

  async get(key, args = null, fallback = key) {
    return fallback;
  }

  async translate(element) {
    return;
  }

  async translateFragment(fragment) {
    return;
  }

  async getLocaleStrings() {
    return {};
  }
}

export { GenericL10n };
