import { Entity, RawEntityData } from './entity'

export interface RawFleetData extends RawEntityData {
  st: number
  ouid: number
}

export class Fleet extends Entity {

  ships: number
  orbitingStarId: number

  constructor(data: RawFleetData) {
    super(data)
    this.ships = data.st
    this.orbitingStarId = data.ouid
  }

}