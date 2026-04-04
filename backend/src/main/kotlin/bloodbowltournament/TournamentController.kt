package bloodbowltournament

import java.time.LocalDate
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/tournaments")
class TournamentController(
    private val nafParserService: NafParserService
) {

    @GetMapping
    fun getTournaments(
        @RequestParam(required = false) countries: List<String>?,
        @RequestParam(required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
        startDate: LocalDate?,
        @RequestParam(required = false, defaultValue = DEFAULT_VARIANT) variant: String
    ): List<TournamentDto> {
        val config = NafCrawlerConfig(
            countries = countries.orEmpty().map { it.trim() }.filter { it.isNotEmpty() },
            startDate = startDate,
            variant = variant.trim().ifEmpty { DEFAULT_VARIANT }
        )

        return nafParserService.crawlFutureTournaments(config)
            .sortedBy { it.date }
    }

    companion object {
        private const val DEFAULT_VARIANT = "Blood Bowl 2025"
    }
}

