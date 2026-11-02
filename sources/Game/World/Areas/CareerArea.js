import { Area } from './Area.js'
import { CareerBoard } from '../CareerBoard.js'

// Kariyer alanı: Bruno'nun zaman çizelgesi (renkli çizgiler, taş levhalar, yıl göstergesi) kaldırıldı; yerine
// kariyer görselini taşıyan pano (CareerBoard) geldi. Alan bölgesi (zone) giriş/çıkış ve başarım için çalışmaya devam eder.
export class CareerArea extends Area
{
    constructor(references)
    {
        super(references)

        this.board = new CareerBoard()
        this.setAchievement()
    }

    setAchievement()
    {
        this.events.on('boundingIn', () =>
        {
            this.game.achievements.setProgress('areas', 'career')
        })
    }
}
