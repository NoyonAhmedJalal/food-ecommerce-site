const { foods, withFoodDefaults } = require('./models/Food');
const { admins, hashPassword } = require('./models/Admin');

const MENU_ITEMS = [
    {
        name: 'Wood-Fired Pizza',
        description: 'Cheesy wood-fired crust loaded with fresh toppings.',
        price: 15,
        image: 'image/gallary_5.jpg',
        category: 'Pizza',
        rating: 4.8,
        sortOrder: 1
    },
    {
        name: 'Classic Pizza',
        description: 'A classic slice with melted mozzarella and herbs.',
        price: 13.5,
        image: 'image/gallary_2.jpg',
        category: 'Pizza',
        rating: 4.6,
        sortOrder: 2
    },
    {
        name: 'Hot Dog',
        description: 'Grilled sausage in a soft bun with tangy mustard.',
        price: 9.99,
        image: 'image/Hot_dog.jpg',
        category: 'Burgers',
        rating: 4.3,
        sortOrder: 3
    },
    {
        name: 'Cheese Burger',
        description: 'A juicy patty with cheese and crisp lettuce.',
        price: 11.99,
        image: 'image/buger.jpg',
        category: 'Burgers',
        rating: 4.7,
        sortOrder: 4
    },
    {
        name: 'Chicken Biryani',
        description: 'Fragrant basmati rice with tender spiced chicken.',
        price: 13.99,
        image: 'image/biryani.webp',
        category: 'Rice',
        rating: 4.9,
        sortOrder: 5
    },
    {
        name: 'Beef Lasagna',
        description: 'Layers of pasta, rich beef sauce and melted cheese.',
        price: 14.5,
        image: 'image/lasagna.webp',
        category: 'Rice',
        rating: 4.6,
        sortOrder: 6
    },
    {
        name: 'Club Sandwich',
        description: 'Toasted bread stacked with crisp, fresh fillings.',
        price: 8.5,
        image: 'image/sandwich.jpg',
        category: 'Burgers',
        rating: 4.4,
        sortOrder: 7
    },
    {
        name: 'Garlic Spinach',
        description: 'Sautéed greens with garlic and a hint of olive oil.',
        price: 6.5,
        image: 'image/Spanchi.jpg',
        category: 'Sides',
        rating: 4.2,
        sortOrder: 8
    },
    {
        name: 'Fresh Fruit Juice',
        description: 'Cold-pressed fruit juice with no added sugar.',
        price: 4.5,
        image: 'image/juse.jpg',
        category: 'Drinks',
        rating: 4.5,
        sortOrder: 9
    },
    {
        name: 'Chocolate Drink',
        description: 'Rich chocolate blended with cold, fresh milk.',
        price: 4,
        image: 'image/chocolate_Drink.jpg',
        category: 'Drinks',
        rating: 4.4,
        sortOrder: 10
    },
    {
        name: 'Vanilla Ice Cream',
        description: 'Creamy scoops in your favourite flavours.',
        price: 5.5,
        image: 'image/ice_cream.jpg',
        category: 'Desserts',
        rating: 4.7,
        sortOrder: 11
    },
    {
        name: 'Chocolate Cake',
        description: 'Soft chocolate cake with silky buttercream frosting.',
        price: 7.5,
        image: 'image/cake.jpg',
        category: 'Desserts',
        rating: 4.8,
        sortOrder: 12
    },
    {
        name: 'Buttercream Cupcake',
        description: 'Chocolate cupcake topped with a buttercream swirl.',
        price: 8,
        image: 'image/gallary_3.jpg',
        category: 'Desserts',
        rating: 4.5,
        sortOrder: 13
    },
    {
        name: 'Family Feast',
        description: 'Two large pizzas, garlic bread and a bottle of juice.',
        price: 39.99,
        oldPrice: 49.99,
        image: 'image/gallary_5.jpg',
        category: 'Combos',
        rating: 4.9,
        isOffer: true,
        sortOrder: 14
    },
    {
        name: 'Burger Combo',
        description: 'Classic burger, crispy fries and a soft drink.',
        price: 12.99,
        oldPrice: 16.99,
        image: 'image/buger.jpg',
        category: 'Combos',
        rating: 4.6,
        isOffer: true,
        sortOrder: 15
    },
    {
        name: 'Sweet Box',
        description: 'Chocolate cake, a cupcake and a cold chocolate drink.',
        price: 9.99,
        oldPrice: 13.99,
        image: 'image/cake.jpg',
        category: 'Combos',
        rating: 4.7,
        isOffer: true,
        sortOrder: 16
    }
];

async function ensureAdmin() {
    const email = (process.env.ADMIN_EMAIL || 'admin@foodies.com').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'Admin@123';

    const existing = await admins().findOne({ email }, { projection: { _id: 1 } });
    if (existing) return { created: false, email };

    const passwordHash = await hashPassword(password);
    const now = new Date();

    await admins().insertOne({
        name: 'Foodies Admin',
        email,
        passwordHash,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now
    });

    return { created: true, email, password };
}

/**
 * Insert the starter menu and admin account when the database is empty.
 * With { force: true } the menu collection is replaced by the starter menu.
 */
async function seedDatabase({ force = false } = {}) {
    const result = { menuCount: 0, admin: null };

    if (force) {
        await foods().deleteMany({});
    }

    if ((await foods().countDocuments()) === 0) {
        const now = new Date();
        await foods().insertMany(
            MENU_ITEMS.map((item) => ({
                ...withFoodDefaults(item),
                createdAt: now,
                updatedAt: now
            }))
        );
    }

    result.menuCount = await foods().countDocuments();
    result.admin = await ensureAdmin();

    return result;
}

module.exports = { MENU_ITEMS, seedDatabase, ensureAdmin };
