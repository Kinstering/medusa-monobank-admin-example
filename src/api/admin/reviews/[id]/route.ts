import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteReviewWorkflow } from "../../../../workflows/reviews"

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await deleteReviewWorkflow(req.scope).run({ input: req.params.id })
  res.json({ id: req.params.id, deleted: true })
}
