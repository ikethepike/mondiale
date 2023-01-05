<template>
  <div class="input-text">
    <input type="text" ref="input" :placeholder="placeholder" @change="onChange" @input="onInput" />
    <ButtonFilled class="inline-button" v-if="inlineButton" @click="onClick">
      <span class="button-text">{{ inlineButton }}</span>
    </ButtonFilled>
  </div>
</template>
<script lang="ts" setup>
const input = ref<HTMLInputElement>()
const emit = defineEmits<{
  (eventName: 'change', value: string): void
  (eventName: 'save', value: string): void
  (eventName: 'input', value: string): void
}>()

defineProps({
  placeholder: {
    required: false,
    type: String,
  },
  inlineButton: {
    required: false,
    type: String,
  },
})

const onClick = () => {
  emit('save', input.value?.value || '')
}

const onChange = () => {
  emit('change', input.value?.value || '')
}

const onInput = () => {
  emit('input', input.value?.value || '')
}
</script>
<style lang="scss" scoped>
.input-text {
  display: flex;
  align-items: center;
  > input {
    width: 100%;
    height: 5rem;
    display: block;
    padding-left: 1rem;
    font-family: inherit;
    border-top-left-radius: 0.6rem;
    border: 0.1rem solid var(--black);
    border-right: none;
    border-bottom: 0.2rem solid var(--black);
  }
}
.inline-button {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
</style>
