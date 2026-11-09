import { ref } from 'vue'
import { defineStore } from 'pinia'
import { metaApi } from '@/api'
import type { FiltersResp } from '@/api/types'

/** 筛选字典（区域/地铁/房型/朝向/租金档/设施）：进站拉一次，全局复用 */
export const useMetaStore = defineStore('meta', () => {
  const filters = ref<FiltersResp | null>(null)
  const loading = ref(false)
  let promise: Promise<FiltersResp | null> | null = null

  async function ensure(): Promise<FiltersResp | null> {
    if (filters.value) return filters.value
    if (promise) return promise
    loading.value = true
    promise = metaApi
      .filters()
      .then((data) => {
        filters.value = data
        return data
      })
      .catch(() => null)
      .finally(() => {
        loading.value = false
        promise = null
      })
    return promise
  }

  return { filters, loading, ensure }
})
