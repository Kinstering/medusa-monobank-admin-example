import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { MonobankPaymentService } from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [MonobankPaymentService],
})
