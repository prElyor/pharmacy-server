import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Orders} from "./orders.model";
import {CreateOrdersDto} from "./dto/create-orders.dto";
import {EditOrdersDto} from "./dto/edit-orders.dto";
import {Op} from "sequelize";
import {MedicinesService} from "../medicines/medicines.service";
import {getResponse} from "../utils/response-util";
import {Basket} from "./basket.model";
import {Medicines} from "../medicines/medicines.model";

@Injectable()
export class OrdersService {

    constructor(
        @InjectModel(Orders) private ordersRepository: typeof Orders,
        @InjectModel(Basket) private basketRepository: typeof Basket,
        private medicineService: MedicinesService,
        ) {}

    async create (dto: CreateOrdersDto[], userId: number): Promise<any> {

        try {

            const medicineIds = dto.map(item => item.medicineId)

            const medicines = await this.medicineService.getByQuery({
                    where: {
                        id: {
                            [Op.and]: medicineIds
                        }
                    }
                })

            if(!medicines){
               throw new HttpException(`Dorilar topilmadi`, HttpStatus.BAD_REQUEST)
            }

            let totalPrice =  this.getTotalPrice(medicines, dto)

           const order = await this.ordersRepository.create({
                userId,
                status: 'active',
                totalPrice
            })

            let basketsArray = this.getBasketsArray(medicines, dto, order)

            const baskets = await this.basketRepository.bulkCreate(basketsArray, {returning: true})

            baskets.forEach(item => {
                totalPrice += item.price
            })

            await order.$set('baskets', baskets)

            order.baskets = baskets

            return getResponse({order, baskets}, 'success', null)

        }catch (e) {
            console.log('error', e)
            throw new Error(e)
        }
    }

    async getAll (query) {
        const options = query.rowsPerPage
            ?
            {
                limit: query.rowsPerPage,
                offset: +query.page === 0 ? query.page : ((query.page - 1) * query.rowsPerPage),
                subQuery: false
            }
            :
            {
                limit: 10,
                offset: 0,
                subQuery: false
            }

        const ordersWithLimit = await this.ordersRepository.findAll( {include: {all: true}, ...options})
        const orders = await this.ordersRepository.findAll()

        return {
            items: ordersWithLimit,
            count: orders.length,
            message: 'Success'
        }
    }

    async getOne (id: number) {
        const order = await this.ordersRepository.findByPk(id)

        if(!order){
            throw new HttpException(`Ushbu id li buyurtma topilmadi!`, HttpStatus.BAD_REQUEST)
        }

        return {
            items: order,
            message: `Success`
        }
    }

    async update (dto: EditOrdersDto) {
        const order = await this.ordersRepository.findByPk(dto.id)
        if (!order) {
            return new HttpException('Kategoriya topilmadi', HttpStatus.BAD_REQUEST)
        }

        const newOrderObj = {
            ...order,
            ...dto
        }

        const newOrder = await this.ordersRepository.update(newOrderObj, {
            where: {id: dto.id},
            returning: true
        })
        return newOrder[1][0]
    }

    async delete (id: number){

        const order = await this.ordersRepository.findByPk(id)

        if(!order){
            throw new HttpException(`Ushbu id li buyurtma topilmadi!`, HttpStatus.BAD_REQUEST)
        }

        await this.ordersRepository.destroy({where: {id: id}})

        return {
            items: order,
            message: `Buyurtma muvaffaqqiyatli o'chirildi`
        }
    }

    private getTotalPrice (medicines: Medicines[], dto: CreateOrdersDto[]): number {
        let totalPrice = 0

        medicines.forEach((medicine) => {
            dto.forEach(item => {
                if(item.medicineId === medicine.id){
                    totalPrice = totalPrice + (medicine.price * item.count)
                }
            })
        })

        return totalPrice
    }

    private getBasketsArray (medicines: Medicines[], dto: CreateOrdersDto[], order: Orders): any[] {

        let basketsArray: any[] = []

        medicines.forEach((medicine) => {
            dto.forEach(item => {
                if(item.medicineId === medicine.id){

                    const obj = {
                        medicineId: item.medicineId,
                        count: item.count,
                        price: medicine.price * item.count,
                        orderId: order.id
                    }

                    basketsArray.push(obj)
                }
            })
        })

        return  basketsArray

}
}
