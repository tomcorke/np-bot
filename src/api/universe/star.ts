import { Entity, RawEntityData } from './entity'

export interface RawStarData extends RawEntityData {
  st: number
}

export class Star extends Entity {

  ships: number

  constructor(data: RawStarData) {
    super(data)
    this.ships = data.st
  }

}