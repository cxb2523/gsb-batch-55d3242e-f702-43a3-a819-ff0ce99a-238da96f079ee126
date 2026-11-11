<script setup lang="ts">
import { useRoute } from "vitepress"
import { onMounted, watch } from "vue"

const route = useRoute()

function patch() {
  const a = document.querySelector<HTMLAnchorElement>(".VPNavBarTitle a")
  if (!a) return
  const { protocol, hostname } = window.location
  a.href =
    hostname === "localhost" || hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : `${protocol}//${hostname.replace(/^docs\./, "")}`
}

onMounted(patch)
watch(() => route.path, patch)
</script>

<template></template>
