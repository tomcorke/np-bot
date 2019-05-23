export interface RawEntityData {
  uid: number
  puid: number
  n: string
}

export abstract class Entity {

  id: number
  ownerId: number
  name: string

  constructor(data: RawEntityData) {
    this.id = data.uid
    this.ownerId = data.puid
    this.name = data.n
  }

}