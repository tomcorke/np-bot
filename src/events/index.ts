enum EventType {
  TECH_ADVANCEMENT,
  STAR_GAINED,
  STAR_LOST,
}

interface Event {
  eventType: EventType
}

interface PlayerEvent extends Event {
  sourcePlayerId: number
}

export interface TechAdvancementEvent extends PlayerEvent {
  eventType: EventType.TECH_ADVANCEMENT
  tech: string
}