<template>
  <div class="uploader-section">
    <h2>Load Model</h2>
    <label class="upload-btn" :class="{ disabled: loading }">
      <input
        type="file"
        accept=".ifc"
        :disabled="loading"
        @change="onFileChange"
      />
      {{ loading ? 'Loading...' : 'Select IFC File' }}
    </label>
  </div>
</template>

<script setup>
defineProps({
  loading: Boolean,
})

const emit = defineEmits(['file-selected'])

function onFileChange(event) {
  const file = event.target.files[0]
  if (file) {
    emit('file-selected', file)
  }
  event.target.value = ''
}
</script>

<style scoped>
.uploader-section {
  padding: 20px;
  border-bottom: 1px solid #0f3460;
}

.uploader-section h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #888;
  margin-bottom: 12px;
}

.upload-btn {
  display: block;
  text-align: center;
  padding: 10px 16px;
  background: #e94560;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.upload-btn:hover:not(.disabled) {
  background: #c73a52;
}

.upload-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.upload-btn input {
  display: none;
}
</style>
