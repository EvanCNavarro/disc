/**
 * Canonical subject used for style thumbnails in the gallery.
 * Every style renders this same object so users can compare aesthetics at a glance.
 */
export const CANONICAL_SUBJECT =
	"a classic 1980s JVC RC-M90 boombox with chrome details, dual front-facing speakers, and a central cassette deck";

/**
 * 100 everyday objects suitable as subjects for AI cover art generation.
 * Used as the `{subject}` in style prompt templates like:
 *   "3D render of a {subject} carved from volcanic basalt..."
 *
 * Objects are concrete, visual, and diverse across categories:
 * animals, instruments, food, furniture, nature, vehicles, tools, etc.
 */
export const COMMON_OBJECTS: readonly string[] = [
	// Animals (10)
	"owl",
	"octopus",
	"wolf",
	"hummingbird",
	"sea turtle",
	"fox",
	"jellyfish",
	"raven",
	"stag beetle",
	"koi fish",

	// Instruments & Music (8)
	"acoustic guitar",
	"grand piano",
	"violin",
	"saxophone",
	"drum kit",
	"turntable",
	"cello",
	"trumpet",

	// Food & Drink (10)
	"pineapple",
	"pomegranate",
	"croissant",
	"wine bottle",
	"artichoke",
	"mushroom",
	"chili pepper",
	"honeycomb",
	"sushi roll",
	"pretzel",

	// Furniture & Household (8)
	"rocking chair",
	"grandfather clock",
	"chandelier",
	"bookshelf",
	"desk lamp",
	"candelabra",
	"birdcage",
	"treasure chest",

	// Nature & Plants (10)
	"bonsai tree",
	"sunflower",
	"cactus",
	"pinecone",
	"seashell",
	"coral reef",
	"venus flytrap",
	"lotus flower",
	"driftwood",
	"crystal geode",

	// Vehicles & Transport (8)
	"hot air balloon",
	"steam locomotive",
	"sailboat",
	"motorcycle",
	"vintage bicycle",
	"rocket ship",
	"submarine",
	"helicopter",

	// Tools & Mechanical (8)
	"compass",
	"hourglass",
	"telescope",
	"sewing machine",
	"typewriter",
	"pocket watch",
	"anvil",
	"magnifying glass",

	// Clothing & Accessories (6)
	"cowboy boot",
	"top hat",
	"crown",
	"gas mask",
	"aviator goggles",
	"boxing glove",

	// Architecture & Structures (8)
	"lighthouse",
	"windmill",
	"pagoda",
	"castle tower",
	"stone bridge",
	"water tower",
	"ferris wheel",
	"gazebo",

	// Art & Recreation (8)
	"chess knight",
	"globe",
	"origami crane",
	"lava lamp",
	"disco ball",
	"snow globe",
	"matryoshka doll",
	"rubiks cube",

	// Technology & Science (8)
	"microscope",
	"film projector",
	"radio",
	"rotary phone",
	"alarm clock",
	"antique camera",
	"anchor",
	"lantern",

	// Weapons & Historical (8)
	"samurai helmet",
	"viking ship",
	"shield",
	"katana",
	"cannonball",
	"pirate flag",
	"war drum",
	"crossbow",
] as const;

/**
 * Return `count` randomly selected objects from the seed list.
 * Uses Fisher-Yates partial shuffle for unbiased selection.
 */
export function getRandomSubjects(count: number): string[] {
	const pool = [...COMMON_OBJECTS];
	const result: string[] = [];
	for (let i = 0; i < count && pool.length > 0; i++) {
		const idx = Math.floor(Math.random() * pool.length);
		result.push(pool[idx]);
		pool[idx] = pool[pool.length - 1];
		pool.pop();
	}
	return result;
}
