package bloodbowltournament

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import org.jsoup.select.Elements
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

/**
 * DTO representing a tournament from the NAF website
 */
data class TournamentDto(
    val country: String,
    val city: String,
    val name: String,
    val date: LocalDate,
    val isMultiDay: Boolean,
    val variant: String,
    val major: String,
    val team: String
)

/**
 * Configuration for the NAF tournament crawler
 */
data class NafCrawlerConfig(
    val countries: List<String> = emptyList(),
    val startDate: LocalDate? = null,
    val variant: String = "Blood Bowl 2025"
)

@Service
class NafParserService {

    private val logger = LoggerFactory.getLogger(this::class.java)
    private val nafUrl = "https://member.thenaf.net/index.php?module=NAF&type=tournaments"

    /**
     * Crawls the NAF tournaments page and extracts future tournaments based on the provided configuration
     *
     * @param config Configuration with countries filter, start date, and variant filter
     * @return List of tournaments matching the criteria
     */
    fun crawlFutureTournaments(config: NafCrawlerConfig): List<TournamentDto> {
        return try {
            logger.info("Fetching NAF tournaments from: $nafUrl")
            val document = Jsoup.connect(nafUrl)
                .userAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
                .timeout(10000)
                .get()

            extractFutureTournaments(document, config)
        } catch (e: Exception) {
            logger.error("Error crawling NAF tournaments", e)
            emptyList()
        }
    }

    /**
     * Extracts the Future Tournaments table from the document
     */
    private fun extractFutureTournaments(document: Document, config: NafCrawlerConfig): List<TournamentDto> {
        val tournaments = mutableListOf<TournamentDto>()

        val tables = document.select("table")
        logger.info("Found ${tables.size} tables on the page")

        for (table in tables) {
            if (isFutureTournamentsTable(table)) {
                logger.info("Found Future Tournaments table")
                tournaments.addAll(parseTableRows(table, config))
                break
            }
        }

        return tournaments
    }

    /**
     * Checks if a table is the Future Tournaments table
     */
    private fun isFutureTournamentsTable(table: Element): Boolean {
        val tableTitle = table.select("tbody tr th").firstOrNull()?.text() ?: ""
        return tableTitle == "Future Tournaments"
    }

    /**
     * Parses the table rows and extracts tournament data
     */
    private fun parseTableRows(table: Element, config: NafCrawlerConfig): List<TournamentDto> {
        val tournaments = mutableListOf<TournamentDto>()
        val rows = table.select("tbody tr")

        logger.info("Processing ${rows.size} tournament rows")

        for (row in rows) {
            try {
                val cells = row.select("td")
                if (cells.isEmpty()) continue

                val tournament = parseTournamentRow(cells, config)
                if (tournament != null) {
                    tournaments.add(tournament)
                    logger.debug("Added tournament: ${tournament.name} in ${tournament.country} on ${tournament.date}")
                }
            } catch (e: Exception) {
                logger.warn("Error parsing tournament row: ${e.message}")
            }
        }

        return tournaments
    }

    /**
     * Parses a single tournament row
     * Expected columns: Country, Name, Date, Variant, Organizer, Location (or similar order)
     */
    private fun parseTournamentRow(cells: Elements, config: NafCrawlerConfig): TournamentDto? {
        val name = cells.getOrNull(0)?.text()?.trim() ?: return null
        val country = cells.getOrNull(1)?.text()?.trim() ?: return null
        val city = cells.getOrNull(3)?.text()?.trim() ?: return null
        val dateStr = cells.getOrNull(4)?.text()?.trim() ?: return null
        val dateEndStr = cells.getOrNull(5)?.text()?.trim() ?: return null
        val variant = cells.getOrNull(6)?.text()?.trim() ?: return null
        val major = cells.getOrNull(7)?.text()?.trim() ?: return null
        val squad = cells.getOrNull(8)?.text()?.trim() ?: return null

        // Parse the date
        val date = parseDate(dateStr) ?: return null
        val dateEnd = parseDate(dateEndStr) ?: return null

        // Apply filters
        if (!matchesCountryFilter(country, config.countries)) {
            return null
        }

        if (!matchesVariantFilter(variant, config.variant)) {
            return null
        }

        if (!matchesDateFilter(date, config.startDate)) {
            return null
        }

        return TournamentDto(
            country = country,
            city = city,
            name = name,
            date = date,
            isMultiDay = date < dateEnd,
            variant = variant,
            major = major,
            team = squad
        )
    }

    /**
     * Parses date from string format (tries multiple common formats)
     */
    private fun parseDate(dateStr: String): LocalDate? {
        val formatters = listOf(
            DateTimeFormatter.ofPattern("yyyy-MM-dd"),
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ofPattern("MM/dd/yyyy"),
            DateTimeFormatter.ofPattern("MMMM dd, yyyy"),
            DateTimeFormatter.ofPattern("dd MMMM yyyy")
        )

        for (formatter in formatters) {
            try {
                return LocalDate.parse(dateStr, formatter)
            } catch (_: Exception) {
                // Try next formatter
            }
        }

        logger.warn("Could not parse date: $dateStr")
        return null
    }

    /**
     * Checks if the tournament's country matches the filter (empty list means all countries)
     */
    private fun matchesCountryFilter(country: String, configCountries: List<String>): Boolean {
        if (configCountries.isEmpty()) return true
        return configCountries.any { it.equals(country, ignoreCase = true) }
    }

    /**
     * Checks if the tournament's variant matches the filter
     */
    private fun matchesVariantFilter(variant: String, configVariant: String): Boolean {
        return variant.contains(configVariant, ignoreCase = true)
    }

    /**
     * Checks if the tournament's date is after the configured start date
     */
    private fun matchesDateFilter(date: LocalDate, startDate: LocalDate?): Boolean {
        if (startDate == null) return true
        return date.isAfter(startDate) || date.isEqual(startDate)
    }
}
