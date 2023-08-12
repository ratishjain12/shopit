const mongoose = require("mongoose");

const orderSchema = mongoose.Schema(
  {
    customerId: { type: String, required: true },
    paymentIntentId: { type: String, required: true },
    userId: {
      type: String,
      required: true,
    },
    products: [
      {
        id: { type: String },
        title: { type: String },
        description: { type: String },
        price: { type: String },
        image: { type: String },
        qty: { type: Number },
      },
    ],
    total: { type: Number, required: true },
    shipping: { type: Object, required: true },
    delivery_status: { type: String, default: "pending" },
    payment_status: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

const order = mongoose.model("order", orderSchema);
module.exports = order;
