<template>
  <div class="toolbar-section">
    <h2>View Options</h2>
    <div class="toolbar-buttons">
      <button
        :class="{ active: wireframe }"
        @click="$emit('toggle-wireframe')"
      >
        Wireframe
      </button>
      <button
        :class="{ active: xray }"
        @click="$emit('toggle-xray')"
      >
        X-Ray
      </button>
      <button @click="$emit('reset-view')">
        Reset View
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  wireframe: Boolean,
  xray: Boolean,
})

defineEmits(['toggle-wireframe', 'toggle-xray', 'reset-view'])
</script>

<style scoped>
.toolbar-section {
  padding: 20px;
  border-bottom: 1px solid #0f3460;
}

.toolbar-section h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #888;
  margin-bottom: 12px;
}

.toolbar-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar-buttons button {
  padding: 8px 12px;
  background: #1a1a2e;
  color: #ccc;
  border: 1px solid #0f3460;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.toolbar-buttons button:hover {
  background: #0f3460;
}

.toolbar-buttons button.active {
  background: #e94560;
  color: white;
  border-color: #e94560;
}
</style>
