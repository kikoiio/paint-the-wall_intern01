<template>
  <div ref="container" class="viewer-container"></div>
</template>

<script setup>
import { ref } from 'vue'

const container = ref(null)

defineExpose({ container })
</script>

<style scoped>
.viewer-container {
  width: 100%;
  height: 100%;
}
</style>
