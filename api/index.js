require("dotenv").config();
const express = require("express");
const { OAuth2Client } = require("google-auth-library");
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const User = require("./models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cookieparser = require("cookie-parser");
const order = require("./models/Order");
const stripe = require("stripe")(`${process.env.STRIPE_KEY}`);
const app = express();
app.use(cookieparser());

app.use(
  cors({
    credentials: true,
    origin: "http://localhost:5173",
  })
);

const createOrder = async (customer, data) => {
  const items = JSON.parse(customer.metadata.cart);
  console.log(items);
  const newOrder = await order.create({
    userId: customer.metadata.userId,
    customerId: data.customer,
    paymentIntentId: data.payment_intent,
    products: items,
    total: data.amount_total,
    shipping: data.customer_details,
    payment_status: data.payment_status,
  });
};
const endpointSecret =
  "whsec_67afecca07b685d1fd35a4f3ca485cb547dc20a67faca473e4738697e1debc73";

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (request, response) => {
    const sig = request.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    switch (event.type) {
      case "checkout.session.completed":
        const data = event.data.object;
        stripe.customers
          .retrieve(data.customer)
          .then((customer) => {
            createOrder(customer, data);
          })
          .catch((err) => console.log(err.message));
        // Then define and call a function to handle the event payment_intent.succeeded
        break;
      // ... handle other event types
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // }

    // Return a 200 response to acknowledge receipt of the event
    response.send();
  }
);
app.use(express.json());

const saltRounds = 10;
const salt = bcrypt.genSaltSync(saltRounds);

const oAuth2Client = new OAuth2Client(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "postmessage"
);

mongoose.connect(
  `mongodb+srv://ratishjain6:${process.env.MONGO_PASSWORD}@cluster0.p5jfmzl.mongodb.net/?retryWrites=true&w=majority`
);

app.post("/auth/google", async (req, res) => {
  const { tokens } = await oAuth2Client.getToken(req.body.code); // exchange code for tokens
  console.log(tokens);

  res.json(tokens);
});

app.post("/register", async (req, res) => {
  const { email, password, username } = req.body;
  const hash = bcrypt.hashSync(password, salt);
  const UserDoc = await User.create({
    email: email,
    password: hash,
    username: username,
  });

  jwt.sign(
    { id: UserDoc._id, username: UserDoc.username, email: UserDoc.email },
    process.env.PRIVATE_KEY,
    {},
    (err, token) => {
      if (err) throw err;
      res.cookie("token", token, { httpOnly: false }).json("Registration Done");
    }
  );
});

app.post("/verify", (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, process.env.PRIVATE_KEY, {}, async (err, info) => {
    if (err) throw err;
    const UserDoc = await User.findOne({ email: info.email });
    res.json(UserDoc);
  });
});

app.post("/logout", (req, res) => {
  res.cookie("token", "", { httpOnly: false }).json("ok");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const UserDoc = await User.findOne({ email });
  if (bcrypt.compareSync(password, UserDoc.password)) {
    jwt.sign(
      { email, id: UserDoc._id },
      process.env.PRIVATE_KEY,
      {},
      (err, token) => {
        if (err) throw err;
        res
          .cookie("token", token, {
            httpOnly: false,
          })
          .json(UserDoc.username);
      }
    );
  } else {
    res.status(400).json("wrong credentials");
  }
});

app.post("/create-checkout-session", async (req, res) => {
  const cart = req.body.cartItems;
  let items = cart.map((item) => {
    return {
      ...item,
      description: item.description.slice(0, 12),
    };
  });
  const customer = await stripe.customers.create({
    metadata: {
      userId: req.body.userId,
      cart: JSON.stringify(items),
    },
  });
  const line_items = req.body.cartItems.map((item) => {
    return {
      price_data: {
        currency: "usd",
        product_data: {
          name: item.title,
          images: [item.image],
          description: item.description,
          metadata: {
            id: item.id,
          },
        },
        unit_amount: item.price * 100,
      },
      quantity: item.qty,
    };
  });

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    line_items,
    mode: "payment",
    success_url: `${process.env.CLIENT_URL}/checkout-success`,
    cancel_url: `${process.env.CLIENT_URL}/cart`,
  });

  res.send({ url: session.url });
});

// app.post("/auth/google/refresh-token", async (req, res) => {
//   const user = new UserRefreshClient(
//     clientId,
//     clientSecret,
//     req.body.refreshToken
//   );
//   const { credentials } = await user.refreshAccessToken(); // optain new tokens
//   res.json(credentials);
// });

app.listen(3001, () => console.log(`server is running`));
