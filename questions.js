function makeQuestion(
  book,
  chapter,
  verse,
  question,
  displayAnswer,
  aliases = [],
  endVerse,
) {
  return {
    question,
    answers: [displayAnswer, ...aliases],
    displayAnswer,
    book,
    chapter,
    verse,
    endVerse,
    testament: `${book} ${chapter}`,
  };
}

const expandedQuestionBank = [
  // Haggai 1
  makeQuestion("Haggai", 1, 1, "To which two leaders did the word of the LORD come by Haggai?", "Zerubbabel and Joshua", ["Zerubbabel the son of Shealtiel and Joshua the son of Jehozadak"]),
  makeQuestion("Haggai", 1, 4, "The people lived in paneled houses while what lay in ruins?", "The temple", ["This temple", "The LORD's house"]),
  makeQuestion("Haggai", 1, 6, "Those who earned wages put them into what kind of bag?", "A bag with holes", ["Bag with holes"]),
  makeQuestion("Haggai", 1, 8, "What were the people told to bring from the mountains to build the temple?", "Wood"),
  makeQuestion("Haggai", 1, 13, "What message did Haggai deliver to the people from the LORD?", "I am with you"),

  // Haggai 2
  makeQuestion("Haggai", 2, 4, "Who were told to be strong and work?", "Zerubbabel, Joshua, and all the people of the land", ["Zerubbabel Joshua and all the people"]),
  makeQuestion("Haggai", 2, 5, "What remained among the people according to the covenant made when they left Egypt?", "My Spirit", ["The LORD's Spirit", "God's Spirit"]),
  makeQuestion("Haggai", 2, 8, "What two precious metals does the LORD declare are His?", "Silver and gold", ["The silver and the gold"]),
  makeQuestion("Haggai", 2, 9, "How would the glory of the latter temple compare with the former?", "It would be greater", ["Greater than the former"]),
  makeQuestion("Haggai", 2, 23, "What would the LORD make Zerubbabel like because He had chosen him?", "A signet ring", ["Signet ring"]),

  // Zechariah 1
  makeQuestion("Zechariah", 1, 1, "Who were Zechariah's father and grandfather?", "Berechiah and Iddo"),
  makeQuestion("Zechariah", 1, 3, "Fill in the blank: \"Return to Me, and I will ________.\"", "Return to you"),
  makeQuestion("Zechariah", 1, 8, "What three colors were the horses behind the man among the myrtle trees?", "Red, sorrel, and white", ["Red sorrel white"]),
  makeQuestion("Zechariah", 1, 12, "For how many years had the LORD been angry with Jerusalem and Judah?", "Seventy years", ["70 years"]),
  makeQuestion("Zechariah", 1, 18, "How many horns did Zechariah see?", "Four", ["4"]),

  // Zechariah 2
  makeQuestion("Zechariah", 2, 1, "What did the man in Zechariah's vision hold in his hand?", "A measuring line", ["Measuring line"]),
  makeQuestion("Zechariah", 2, 4, "Why would Jerusalem be inhabited as towns without walls?", "Because of the multitude of men and livestock", ["The multitude of men and livestock"]),
  makeQuestion("Zechariah", 2, 5, "What would the LORD be all around Jerusalem?", "A wall of fire", ["Wall of fire"]),
  makeQuestion("Zechariah", 2, 8, "Whoever touched God's people touched what?", "The apple of His eye", ["Apple of His eye", "The apple of God's eye"]),
  makeQuestion("Zechariah", 2, 12, "What land is called the LORD's inheritance?", "Judah", ["Judah in the Holy Land"]),

  // Zechariah 3
  makeQuestion("Zechariah", 3, 1, "Which high priest stood before the Angel of the LORD?", "Joshua", ["Joshua the high priest"]),
  makeQuestion("Zechariah", 3, 3, "What kind of garments was Joshua wearing?", "Filthy garments", ["Filthy"]),
  makeQuestion("Zechariah", 3, 4, "What would replace Joshua's filthy garments?", "Rich robes", ["Rich garments"]),
  makeQuestion("Zechariah", 3, 8, "By what title is the LORD's coming Servant identified?", "The BRANCH", ["BRANCH", "The Branch"]),
  makeQuestion("Zechariah", 3, 9, "How many eyes were upon the stone laid before Joshua?", "Seven", ["7", "Seven eyes"]),

  // Zechariah 4
  makeQuestion("Zechariah", 4, 2, "What object of solid gold did Zechariah see?", "A lampstand", ["A lampstand of solid gold", "Lampstand"]),
  makeQuestion("Zechariah", 4, 3, "What two trees stood beside the lampstand?", "Two olive trees", ["Olive trees"]),
  makeQuestion("Zechariah", 4, 6, "Fill in the blank: \"Not by might nor by power, but by ________.\"", "My Spirit", ["The Spirit", "God's Spirit", "Spirit"]),
  makeQuestion("Zechariah", 4, 9, "Who laid the temple's foundation and would also finish it?", "Zerubbabel"),
  makeQuestion("Zechariah", 4, 14, "Who did the two olive trees represent?", "The two anointed ones", ["Two anointed ones"]),

  // Zechariah 5
  makeQuestion("Zechariah", 5, 2, "What flying object did Zechariah see?", "A flying scroll", ["Flying scroll", "Scroll"]),
  makeQuestion("Zechariah", 5, 2, "What were the scroll's dimensions?", "Twenty cubits by ten cubits", ["20 cubits by 10 cubits", "Twenty cubits long and ten cubits wide"]),
  makeQuestion("Zechariah", 5, 3, "Which two kinds of offenders would be expelled by the scroll's curse?", "Every thief and every perjurer", ["Thieves and perjurers", "The thief and the perjurer"]),
  makeQuestion("Zechariah", 5, 8, "What did the woman inside the basket represent?", "Wickedness"),
  makeQuestion("Zechariah", 5, 11, "To what land was the basket being carried?", "Shinar", ["The land of Shinar"]),

  // Zechariah 6
  makeQuestion("Zechariah", 6, 1, "Of what material were the two mountains between which the chariots appeared?", "Bronze", ["Mountains of bronze"]),
  makeQuestion("Zechariah", 6, 2, "What colors were the horses of the first three chariots?", "Red, black, and white", ["Red black white"]),
  makeQuestion("Zechariah", 6, 5, "What did the four chariots represent?", "Four spirits of heaven", ["The four spirits of heaven"]),
  makeQuestion("Zechariah", 6, 11, "On whose head was the elaborate crown placed?", "Joshua the high priest", ["Joshua", "Joshua the son of Jehozadak"]),
  makeQuestion("Zechariah", 6, 12, "What would the Man called the BRANCH build?", "The temple of the LORD", ["The LORD's temple", "The temple"]),

  // Zechariah 7
  makeQuestion("Zechariah", 7, 1, "In what month did the word of the LORD come to Zechariah in Darius's fourth year?", "Chislev", ["The ninth month", "The ninth month Chislev"]),
  makeQuestion("Zechariah", 7, 5, "In which two months had the people fasted and mourned for seventy years?", "The fifth and seventh months", ["Fifth and seventh months"]),
  makeQuestion("Zechariah", 7, 9, "What three things were the people commanded to show?", "True justice, mercy, and compassion", ["Justice mercy and compassion"]),
  makeQuestion("Zechariah", 7, 10, "Which four vulnerable groups were the people forbidden to oppress?", "The widow, the fatherless, the alien, and the poor", ["Widow fatherless alien and poor"]),
  makeQuestion("Zechariah", 7, 12, "What did the people make their hearts like?", "Flint", ["Like flint"]),

  // Zechariah 8
  makeQuestion("Zechariah", 8, 3, "What would Jerusalem be called when the LORD returned to Zion?", "The City of Truth", ["City of Truth"]),
  makeQuestion("Zechariah", 8, 5, "Who would fill Jerusalem's streets while playing?", "Boys and girls", ["The boys and girls"]),
  makeQuestion("Zechariah", 8, 7, "From which two directions would the LORD save His people?", "East and west", ["The land of the east and the land of the west"]),
  makeQuestion("Zechariah", 8, 16, "What was each person commanded to speak to his neighbor?", "The truth", ["Truth"]),
  makeQuestion("Zechariah", 8, 19, "Which four fasts would become joyful and cheerful feasts?", "The fourth, fifth, seventh, and tenth", ["Fourth fifth seventh and tenth"]),

  // Zechariah 9
  makeQuestion("Zechariah", 9, 3, "What two treasures did Tyre heap up?", "Silver and gold"),
  makeQuestion("Zechariah", 9, 9, "What animal would Zion's King ride?", "A donkey", ["Donkey", "A colt", "The foal of a donkey"]),
  makeQuestion("Zechariah", 9, 10, "From where to where would the King's dominion extend?", "From sea to sea and from the River to the ends of the earth", ["Sea to sea and the River to the ends of the earth"]),
  makeQuestion("Zechariah", 9, 11, "From what would the covenant prisoners be set free?", "The waterless pit", ["A waterless pit", "Waterless pit"]),
  makeQuestion("Zechariah", 9, 17, "What would make the young men and young women thrive?", "Grain and new wine", ["Grain for the young men and new wine for the young women"]),

  // Zechariah 10
  makeQuestion("Zechariah", 10, 1, "What were the people told to ask the LORD for in the time of latter rain?", "Rain"),
  makeQuestion("Zechariah", 10, 2, "What did the idols speak?", "Delusion", ["A delusion"]),
  makeQuestion("Zechariah", 10, 2, "Why were the people in trouble as they wandered like sheep?", "There was no shepherd", ["Because there was no shepherd", "No shepherd"]),
  makeQuestion("Zechariah", 10, 4, "Name the four things that would come from Judah.", "The cornerstone, tent peg, battle bow, and every ruler", ["Cornerstone tent peg battle bow and every ruler"]),
  makeQuestion("Zechariah", 10, 10, "From which two lands would the LORD bring His people back?", "Egypt and Assyria", ["The land of Egypt and Assyria"]),

  // Zechariah 11
  makeQuestion("Zechariah", 11, 1, "Why was Lebanon told to open its doors?", "That fire might devour its cedars", ["For fire to devour its cedars"]),
  makeQuestion("Zechariah", 11, 7, "What names were given to the two staffs?", "Beauty and Bonds"),
  makeQuestion("Zechariah", 11, 8, "How many shepherds were dismissed in one month?", "Three", ["3", "Three shepherds"]),
  makeQuestion("Zechariah", 11, 12, "How much silver was weighed out as wages?", "Thirty pieces of silver", ["30 pieces of silver"]),
  makeQuestion("Zechariah", 11, 13, "To whom did the LORD say to throw the thirty pieces of silver?", "The potter", ["Potter"]),

  // Zechariah 12
  makeQuestion("Zechariah", 12, 2, "What would Jerusalem become to the surrounding peoples?", "A cup of drunkenness", ["Cup of drunkenness"]),
  makeQuestion("Zechariah", 12, 3, "What kind of stone would Jerusalem become for all peoples?", "A very heavy stone", ["Very heavy stone", "A heavy stone"]),
  makeQuestion("Zechariah", 12, 7, "Whose tents would the LORD save first?", "The tents of Judah", ["Judah", "Tents of Judah"]),
  makeQuestion("Zechariah", 12, 10, "What Spirit would the LORD pour on the house of David and Jerusalem?", "The Spirit of grace and supplication", ["Spirit of grace and supplication"]),
  makeQuestion("Zechariah", 12, 11, "Where was Hadad Rimmon, whose mourning was compared with Jerusalem's?", "The plain of Megiddo", ["Plain of Megiddo"]),

  // Zechariah 13
  makeQuestion("Zechariah", 13, 1, "For what two things would the fountain be opened?", "Sin and uncleanness"),
  makeQuestion("Zechariah", 13, 2, "What three things would depart from the land?", "The idols, the prophets, and the unclean spirit", ["Idols prophets and the unclean spirit"]),
  makeQuestion("Zechariah", 13, 5, "What occupation would the man claim instead of being a prophet?", "A farmer", ["Farmer"]),
  makeQuestion("Zechariah", 13, 7, "What would happen to the sheep when the Shepherd was struck?", "They would be scattered", ["The sheep would be scattered", "Scattered"]),
  makeQuestion("Zechariah", 13, 8, "What fractions of the land would die and remain?", "Two-thirds would die and one-third would remain", ["Two thirds die and one third remain"]),

  // Zechariah 14
  makeQuestion("Zechariah", 14, 4, "On what mountain would the LORD's feet stand?", "The Mount of Olives", ["Mount of Olives"]),
  makeQuestion("Zechariah", 14, 8, "Toward which two seas would the living waters from Jerusalem flow?", "The eastern sea and the western sea", ["Eastern and western seas"]),
  makeQuestion("Zechariah", 14, 9, "Over how much of the earth would the LORD be King?", "All the earth", ["The whole earth"]),
  makeQuestion("Zechariah", 14, 16, "What feast would the surviving nations keep each year?", "The Feast of Tabernacles", ["Feast of Tabernacles", "Tabernacles"]),
  makeQuestion("Zechariah", 14, 20, "What words would be engraved on the bells of the horses?", "HOLINESS TO THE LORD", ["Holiness to the LORD"]),

  // Malachi 1
  makeQuestion("Malachi", 1, 2, "Which of the two brothers did the LORD say He loved?", "Jacob"),
  makeQuestion("Malachi", 1, 4, "What would Edom be called after the LORD threw down what they rebuilt?", "The Territory of Wickedness", ["Territory of Wickedness"]),
  makeQuestion("Malachi", 1, 6, "Whom does a son honor, and whom does a servant honor?", "His father and his master", ["Father and master"]),
  makeQuestion("Malachi", 1, 8, "What three kinds of unacceptable sacrifices are named?", "The blind, the lame, and the sick", ["Blind lame and sick"]),
  makeQuestion("Malachi", 1, 14, "What title does the LORD use for Himself?", "A great King", ["Great King"]),

  // Malachi 2
  makeQuestion("Malachi", 2, 5, "What two things characterized the LORD's covenant with Levi?", "Life and peace"),
  makeQuestion("Malachi", 2, 6, "What was in Levi's mouth?", "The law of truth", ["Law of truth"]),
  makeQuestion("Malachi", 2, 7, "What should the lips of a priest keep?", "Knowledge"),
  makeQuestion("Malachi", 2, 14, "Between a man and whom had the LORD been witness?", "The wife of his youth", ["His wife", "Wife of his youth"]),
  makeQuestion("Malachi", 2, 16, "What does the LORD God of Israel say that He hates?", "Divorce"),

  // Malachi 3
  makeQuestion("Malachi", 3, 1, "Who would prepare the way before the LORD?", "My messenger", ["The LORD's messenger", "The messenger"]),
  makeQuestion("Malachi", 3, 2, "What two comparisons describe the Lord at His coming?", "A refiner's fire and launderers' soap", ["Refiners fire and launderers soap"]),
  makeQuestion("Malachi", 3, 6, "Why were the sons of Jacob not consumed?", "Because the LORD does not change", ["The LORD does not change", "I am the LORD I do not change"]),
  makeQuestion("Malachi", 3, 8, "How had the people robbed God?", "In tithes and offerings", ["Tithes and offerings"]),
  makeQuestion("Malachi", 3, 16, "What was written for those who feared the LORD and meditated on His name?", "A book of remembrance", ["Book of remembrance"]),

  // Malachi 4
  makeQuestion("Malachi", 4, 1, "What would the coming day burn like?", "An oven", ["A burning oven", "Oven"]),
  makeQuestion("Malachi", 4, 2, "What would arise with healing in His wings?", "The Sun of Righteousness", ["Sun of Righteousness"]),
  makeQuestion("Malachi", 4, 3, "What would the wicked be under the soles of their feet?", "Ashes"),
  makeQuestion("Malachi", 4, 4, "Whose law were the people commanded to remember?", "The Law of Moses", ["Moses' law", "The law of Moses My servant"]),
  makeQuestion("Malachi", 4, 5, "Which prophet would be sent before the great and dreadful day of the LORD?", "Elijah", ["Elijah the prophet"]),
];
