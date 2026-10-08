import { Timestamp, writeBatch } from "firebase/firestore";
import { COL, db, newId, subDoc } from "./firestore";
import { doc } from "firebase/firestore";
import { clientService } from "@/services/firebase/clientService";
import type { Actor } from "./types";

const now = () => Date.now();
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};

function rng(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const DEMOS = [
  {
    slug: "bake",
    category: "Cafe & Bakery",
    email: "hello@bake.cafe",
    businessName: "BAKE Café & Bakery",
    displayName: "BAKE",
    tagline: "Good Food • Brighter Days",
    description: "A cosy café & bakery serving delicious coffee, fresh pastries and slow mornings.",
    address: "12 Rosewood Lane, Indiranagar, Bengaluru 560038",
    phone: "+91 98450 11223",
    theme: ["#3A2116", "#5A3524", "#C0651E", "#F7EFE3", "#23130C"],
    loyalty: { target: 8, reward: "Free Coffee", desc: "Collect 8 stamps to get a free coffee on us!" },
    cover: "images/cover-bake.jpg",
    menu: [
      ["Coffee", [["Cappuccino", 180, "images/item-cappuccino.jpg"], ["Cold Coffee", 160, "images/item-coldcoffee.jpg"], ["Espresso", 130, ""]]],
      ["Pastry", [["Chocolate Cake", 190, "images/item-cake.jpg"], ["Croissant", 140, "images/item-croissant.jpg"]]],
      ["Sandwich", [["Veg Sandwich", 220, "images/item-sandwich.jpg"]]],
    ] as [string, [string, number, string][]][],
  },
  {
    slug: "sharma-cafe",
    category: "Cafe",
    email: "hello@sharma.cafe",
    businessName: "Sharma Cafe",
    displayName: "Sharma Cafe",
    tagline: "Ghar jaisa swaad",
    description: "A family-run cafe serving chai, tiffin and snacks the way home does.",
    address: "44 MG Road, Camp, Pune 411001",
    phone: "+91 90280 44551",
    theme: ["#5A2E1B", "#8A4B2A", "#D07C2A", "#FBF1E4", "#2B1810"],
    loyalty: { target: 10, reward: "Free Pizza", desc: "Collect 10 stamps and the pizza is on the house." },
    cover: "images/cover-sharma.jpg",
    menu: [
      ["Beverages", [["Masala Chai", 60, ""], ["Cold Coffee", 120, "images/item-coldcoffee.jpg"]]],
      ["Snacks", [["Veg Sandwich", 110, "images/item-sandwich.jpg"], ["Chocolate Cake", 150, "images/item-cake.jpg"]]],
      ["Mains", [["Paneer Tikka Thali", 240, "images/item-thali.jpg"]]],
    ] as [string, [string, number, string][]][],
  },
  {
    slug: "royal-restaurant",
    category: "Restaurant",
    email: "hello@royal.restaurant",
    businessName: "Royal Restaurant",
    displayName: "Royal",
    tagline: "Since 1974",
    description: "North Indian classics served in a room built for long dinners.",
    address: "7 Station Road, Hazratganj, Lucknow 226001",
    phone: "+91 93350 77821",
    theme: ["#3B1616", "#6B2424", "#C79A3A", "#F8EFE6", "#241010"],
    loyalty: { target: 6, reward: "Free Dessert", desc: "Six visits and dessert is complimentary." },
    cover: "images/cover-royal.jpg",
    menu: [
      ["Mains", [["Paneer Butter Masala", 320, "images/item-thali.jpg"], ["Dal Fry", 240, ""]]],
      ["Breads", [["Butter Naan", 60, ""]]],
      ["Desserts", [["Chocolate Cake", 220, "images/item-cake.jpg"]]],
    ] as [string, [string, number, string][]][],
  },
];

const FIRST = ["Rahul", "Priya", "Arjun", "Kavya", "Neha", "Rohit", "Ananya", "Vikram"];
const LAST = ["Sharma", "Singh", "Mehta", "Patel", "Verma", "Kumar"];

/**
 * Idempotent demo seeding into the shared cafe-review7 schema — run by a
 * signed-in SUPER_ADMIN from Settings (or the dashboard's empty state).
 * Skips any client whose slug already exists; fake data only.
 */
export async function seedDemoClients(actor: Actor): Promise<string[]> {
  const created: string[] = [];
  for (const demo of DEMOS) {
    const exists = await clientService.bySlug(demo.slug);
    if (exists) continue;
    const { clientId } = await clientService.create(actor, {
      businessName: demo.businessName,
      displayName: demo.displayName,
      tagline: demo.tagline,
      description: demo.description,
      address: demo.address,
      phone: demo.phone,
      slug: demo.slug,
      category: demo.category,
      email: demo.email,
      coverImageUrl: demo.cover,
      primaryColor: demo.theme[0],
      secondaryColor: demo.theme[1],
      accentColor: demo.theme[2],
      backgroundColor: demo.theme[3],
      textColor: demo.theme[4],
      googleReviewUrl: `https://g.page/r/${demo.slug}/review`,
      instagram: `https://instagram.com/${demo.slug.replace(/-/g, ".")}`,
      facebook: "",
      youtube: "",
      website: "",
      wifiEnabled: demo.slug !== "royal-restaurant",
      wifiSsid: `${demo.displayName.replace(/\s+/g, "")}-Guest`,
      wifiMessage: "You're connected — enjoy your visit.",
      loyaltyEnabled: true,
      stampTarget: demo.loyalty.target,
      rewardName: demo.loyalty.reward,
      rewardDescription: demo.loyalty.desc,
      aiEnabled: demo.slug === "bake",
      aiMonthlyLimit: 200,
      aiPrice: 100,
    });

    const batch = writeBatch(db());
    const rnd = rng(demo.slug);

    // menuCategories + menuItems subcollections (shared schema field names)
    demo.menu.forEach(([catName, items], ci) => {
      const catId = newId("cat");
      batch.set(subDoc(clientId, "menuCategories", catId), {
        clientId,
        name: catName,
        slug: catName.toLowerCase(),
        sortOrder: ci,
        active: true,
        createdAt: now(),
      });
      items.forEach(([name, price, img], j) => {
        batch.set(subDoc(clientId, "menuItems", newId("itm")), {
          clientId,
          categoryId: catId,
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          price,
          description: `${name}, prepared fresh to order.`,
          fullDescription: `${name} made with ingredients sourced the same week.`,
          image: img || null,
          rating: Math.round((4.2 + rnd() * 0.7) * 10) / 10,
          ingredients: "See kitchen card",
          dietaryInfo: "Vegetarian",
          allergens: "Gluten, Milk",
          preparationTime: 8 + j * 2,
          calories: 120 + j * 80,
          featured: ci === 0 && j === 0,
          active: true,
          sortOrder: j,
          views: 100 + Math.floor(rnd() * 260),
          clicks: 40 + Math.floor(rnd() * 90),
          createdAt: now(),
          updatedAt: now(),
        });
      });
    });

    // customers + loyaltyAccounts (top-level)
    for (let i = 0; i < 8; i++) {
      const custId = newId("cus");
      const name = `${FIRST[(i * 3) % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`;
      batch.set(doc(db(), COL.customers, custId), {
        clientId,
        code: `#C${1000 + i}`,
        name,
        phone: `+91 9${Math.floor(100000000 + rnd() * 899999999)}`,
        email: `${name.split(" ")[0].toLowerCase()}.${i}@example.com`,
        totalVisits: 2 + Math.floor(rnd() * 18),
        lastVisitAt: now() - Math.floor(rnd() * 7) * 864e5,
        createdAt: now() - (30 + Math.floor(rnd() * 90)) * 864e5,
      });
      batch.set(doc(db(), COL.loyaltyAccounts, custId), {
        clientId,
        customerId: custId,
        stamps: Math.floor(rnd() * (demo.loyalty.target + 1)),
        lifetimeStamps: 5 + Math.floor(rnd() * 30),
        rewardsEarned: Math.floor(rnd() * 3),
        rewardsRedeemed: Math.floor(rnd() * 2),
        updatedAt: now(),
      });
    }

    // reviews + feedback subcollections
    const copy = [
      "Cappuccino was perfectly balanced and the croissant actually flaked.",
      "Fast service even during the rush — the staff remembered our order.",
      "The sandwich was fresh and the chai had real ginger. Fair prices.",
      "Beautiful interiors and warm service. Dessert was the highlight.",
    ];
    copy.forEach((content, i) => {
      batch.set(subDoc(clientId, "reviews", newId("rev")), {
        clientId,
        source: i % 3 === 0 ? "AI" : "GOOGLE",
        rating: 4 + (i % 2),
        staffRating: 4 + (i % 2),
        serviceRating: 3 + (i % 3),
        items: demo.menu[0][1][0][0],
        content,
        status: "PUBLISHED",
        createdAt: now() - i * 3 * 864e5,
      });
    });
    // Canonical Customer Feedback schema — the SAME document shape the customer
    // app writes (and the only ratings source the admin console aggregates).
    // Demo ratings: 5, text-only (null), 3.
    [
      ["Play more jazz in the evenings!", 5],
      ["A sugar-free cold coffee option would be lovely.", null],
      ["The corner table wobbles.", 3],
    ].forEach(([message, rating], i) => {
      const at = Timestamp.fromMillis(now() - i * 4 * 864e5);
      batch.set(subDoc(clientId, "feedback", newId("fbk")), {
        clientId,
        rating,
        message,
        source: "customer_feedback",
        status: "new",
        adminReply: null,
        aiReply: null,
        repliedAt: null,
        repliedBy: null,
        createdAt: at,
        updatedAt: at,
      });
    });

    // table QRs
    [1, 2, 3].forEach((t) => {
      batch.set(subDoc(clientId, "qrConfigurations", newId("qrc")), {
        clientId,
        type: "TABLE",
        label: `Table ${t}`,
        tableNumber: t,
        heading: `Table ${t}`,
        subtitle: "Scan to view our menu",
        createdAt: now(),
      });
    });

    // 30 days of pre-aggregated metrics
    for (let d = 29; d >= 0; d--) {
      const r = rng(`${demo.slug}-${d}`);
      batch.set(doc(db(), COL.metricsDaily, `${clientId}_${day(d)}`), {
        clientId,
        day: day(d),
        qrScans: 12 + Math.floor(r() * 36),
        menuViews: 18 + Math.floor(r() * 50),
        googleReviews: Math.floor(r() * 4),
        socialClicks: Math.floor(r() * 12),
        wifiConnections: Math.floor(r() * 15),
        feedback: Math.floor(r() * 3),
        stamps: 5 + Math.floor(r() * 18),
        rewards: Math.floor(r() * 3),
      });
    }

    await batch.commit();
    created.push(demo.slug);
  }
  return created;
}
