package bloodbowltournament

import org.springframework.boot.CommandLineRunner
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.context.annotation.Bean
import java.time.LocalDate

@SpringBootApplication
class BloodBowlTournamentApplication {

    @Bean
    fun nafCrawlerRunner(nafParserService: NafParserService): CommandLineRunner {
        return CommandLineRunner { _ ->
            // Configuration: customize these values
            val config = NafCrawlerConfig(
                countries = listOf("Bulgaria", "Greece", "Malta"),  // Empty list = all countries
                startDate = LocalDate.now(),
                variant = "Blood Bowl 2025"
            )

            println("Starting NAF Tournament Crawler")
            println("=====================================")
            println("Configuration:")
            println("  Countries: ${if (config.countries.isEmpty()) "All" else config.countries.joinToString(", ")}")
            println("  Start Date: ${config.startDate}")
            println("  Variant: ${config.variant}")
            println("=====================================\n")

            val tournaments = nafParserService.crawlFutureTournaments(config)

            if (tournaments.isEmpty()) {
                println("No tournaments found matching the criteria.")
            } else {
                println("Found ${tournaments.size} tournaments:\n")
                tournaments.sortedBy { it.date }.forEach { tournament ->
                    println("Tournament: ${tournament.name}")
                    println("  Country: ${tournament.country}")
                    println("  City: ${tournament.city}")
                    println("  Date: ${tournament.date}")
                    println("  Is Multi Day ${tournament.isMultiDay}")
                    println("  Variant: ${tournament.variant}")
                    println("  Major: ${tournament.major}")
                    println("  Team: ${tournament.team}")
                    println()
                }

                println("=====================================")
                println("Total tournaments: ${tournaments.size}")
            }
        }
    }
}

fun main(args: Array<String>) {
    runApplication<BloodBowlTournamentApplication>(*args)
}