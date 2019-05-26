

export interface FileGameConfig {
  controlMessageId?: string
  notificationsEnabled: boolean
  notificationChannelId?: string
  ignored?: boolean
  updateControlMessage?: (...args: any[]) => Promise<void>
}