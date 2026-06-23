const ADJECTIVES = [
  'Anonymous',
  'Mysterious',
  'Clever',
  'Curious',
  'Speedy',
  'Brave',
  'Wise',
  'Jolly',
  'Swift',
  'Shy',
]

const ANIMALS = [
  'Chipmunk',
  'Gecko',
  'Lemur',
  'Otter',
  'Raccoon',
  'Badger',
  'Ferret',
  'Wombat',
  'Meerkat',
  'Pangolin',
  'Platypus',
  'Quokka',
  'Axolotl',
  'Capybara',
  'Porcupine',
  'Sloth',
  'Anteater',
  'Tapir',
  'Llama',
  'Alpaca',
  'Koala',
  'Kiwi',
  'Puffin',
  'Narwhal',
  'Manatee',
]

export function getRandomName(userId?: string): string {
  let seed = 0
  if (userId) {
    // Use userId as seed for consistent names
    for (let i = 0; i < userId.length; i++) {
      seed += userId.charCodeAt(i)
    }
  } else {
    seed = Math.floor(Math.random() * 1000000)
  }

  const adjective = ADJECTIVES[seed % ADJECTIVES.length]
  const animal = ANIMALS[(seed * 7) % ANIMALS.length]
  
  return `${adjective} ${animal}`
}
