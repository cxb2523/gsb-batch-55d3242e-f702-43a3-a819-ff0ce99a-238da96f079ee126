import DefaultTheme from "vitepress/theme"
import { h } from "vue"
import LogoPatcher from "./LogoPatcher.vue"

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "layout-top": () => h(LogoPatcher),
    })
  },
}
