import { atom } from 'jotai'

export type Screen =
  | 'transactions'
  | 'edit'
  | 'categorize'
  | 'review'
  | 'yolo'
  | 'memo-yolo'
  | 'settings'
  | 'payees'
  | 'help'

export interface ScreenParams {
  transactionId?: string
  transactionIds?: string[]
  payeeId?: string
  includeExisting?: boolean
}

export const currentScreenAtom = atom<Screen>('transactions')
export const screenParamsAtom = atom<ScreenParams>({})

// Navigation actions
export const navigateAtom = atom(
  null,
  (get, set, screen: Screen, params: ScreenParams = {}) => {
    set(currentScreenAtom, screen)
    set(screenParamsAtom, params)
  }
)

export const goBackAtom = atom(null, (get, set) => {
  set(currentScreenAtom, 'transactions')
  set(screenParamsAtom, {})
})
