import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./zh.json";

// The readers this app is for read Chinese only; every string lives in zh.json so more languages can be added.
void i18n
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
    },
    lng: "zh",
    fallbackLng: "zh",
    interpolation: { escapeValue: false },
  });

export default i18n;
